import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const executable =
  process.argv.slice(2).find((argument) => argument !== '--') || 'opencode';
const version = execFileSync(executable, ['--version'], {
  encoding: 'utf8',
}).trim();
assert.match(
  version,
  /^1\./,
  'Pass the path to a V1 executable, not a V2 alias.',
);
const temporaryRoot = join(tmpdir(), 'opencode');
await mkdir(temporaryRoot, { recursive: true });
const temporary = await mkdtemp(join(temporaryRoot, 'yee-profile-v1-'));
const pluginPath =
  process.env.PROFILE_PLUGIN_PATH ||
  fileURLToPath(new URL('..', import.meta.url));
const password = randomUUID();
const environment = {
  PATH: process.env.PATH,
  HOME: join(temporary, 'home'),
  TMPDIR: process.env.TMPDIR || tmpdir(),
  XDG_CONFIG_HOME: join(temporary, 'config'),
  XDG_DATA_HOME: join(temporary, 'data'),
  XDG_STATE_HOME: join(temporary, 'state'),
  XDG_CACHE_HOME: join(temporary, 'cache'),
  OPENCODE_CONFIG_DIR: join(temporary, 'config', 'opencode'),
  OPENCODE_DISABLE_DEFAULT_PLUGINS: '1',
  OPENCODE_DISABLE_AUTOUPDATE: '1',
  OPENCODE_SERVER_PASSWORD: password,
  NO_COLOR: '1',
};
let child;
let logs = '';

try {
  await mkdir(environment.HOME, { recursive: true });
  await mkdir(environment.OPENCODE_CONFIG_DIR, { recursive: true });
  const projects = {};
  const configFiles = new Map();
  for (const [name, config] of Object.entries({
    baseline: {},
    enabled: {
      agent: {
        general: { permission: { bash: { 'git push *': 'deny' } } },
      },
      plugin: [
        [
          pluginPath,
          {
            agents: { general: { model: 'example/coder#high' } },
          },
        ],
      ],
    },
    disabled: {
      plugin: [[pluginPath, { agents: { general: false, oracle: false } }]],
    },
  })) {
    const directory = join(temporary, name);
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'opencode.json');
    const content = JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      ...config,
    });
    await writeFile(path, content);
    configFiles.set(path, content);
    projects[name] = directory;
  }

  child = spawn(
    executable,
    ['serve', '--hostname', '127.0.0.1', '--port', '0'],
    {
      cwd: temporary,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`V1 startup timed out:\n${logs}`)),
      30_000,
    );
    const receive = (chunk) => {
      logs += chunk.toString();
      const match = logs.match(/listening on (http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    };
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`V1 exited (${code}):\n${logs}`));
    });
  });

  async function request(project, path) {
    const response = await fetch(new URL(path, url), {
      headers: {
        authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`,
        'x-opencode-directory': encodeURIComponent(projects[project]),
      },
      signal: AbortSignal.timeout(60_000),
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.match(
      response.headers.get('content-type') ?? '',
      /application\/json/,
      `Expected JSON from ${response.url}; host logs:\n${logs}`,
    );
    return response.json();
  }
  const baseline = new Map(
    (await request('baseline', '/agent')).map((agent) => [agent.name, agent]),
  );
  const enabled = new Map(
    (await request('enabled', '/agent')).map((agent) => [agent.name, agent]),
  );
  assert.deepEqual(
    enabled.get('build'),
    baseline.get('build'),
    'V1 modified native Build',
  );
  assert.equal((await request('enabled', '/config')).default_agent, 'build');
  for (const name of ['general', 'explore', 'oracle', 'designer']) {
    const agent = enabled.get(name);
    assert.equal(agent?.mode, 'subagent', `${name} was not registered`);
    const prompt = await readFile(
      new URL(`../src/prompts/${name}.md`, import.meta.url),
      'utf8',
    );
    assert.equal(agent.prompt, prompt.trim());
    const permission = (action) =>
      agent.permission.findLast(
        (rule) =>
          (rule.permission === action || rule.permission === '*') &&
          rule.pattern === '*',
      )?.action;
    assert.equal(permission('task'), 'deny');
    if (name === 'oracle' || name === 'explore') {
      for (const action of ['bash', 'edit', 'future_mcp_write'])
        assert.equal(permission(action), 'deny');
      for (const action of ['read', 'glob', 'grep'])
        assert.equal(permission(action), 'allow');
      assert.equal(permission('external_directory'), 'ask');
      assert.ok(
        agent.permission.some(
          (rule) =>
            rule.permission === 'read' &&
            rule.pattern === '*.env' &&
            rule.action === 'ask',
        ),
      );
    }
  }
  assert.deepEqual(enabled.get('general').model, {
    providerID: 'example',
    modelID: 'coder',
  });
  assert.equal(enabled.get('general').variant, 'high');
  assert.ok(
    enabled
      .get('general')
      .permission.some(
        (rule) =>
          rule.permission === 'bash' &&
          rule.pattern === 'git push *' &&
          rule.action === 'deny',
      ),
  );
  const disabled = await request('disabled', '/agent');
  assert.equal(
    disabled.some(
      (agent) => agent.name === 'general' || agent.name === 'oracle',
    ),
    false,
  );
  assert.ok(disabled.some((agent) => agent.name === 'designer'));
  for (const [path, content] of configFiles) {
    assert.equal(await readFile(path, 'utf8'), content);
  }
  console.log(
    `Real V1 ${version} host smoke passed: native Build and config files preserved; all prompts, permissions, model variant, and disable options verified. No model requests.`,
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = once(child, 'exit');
    child.kill('SIGTERM');
    const kill = setTimeout(() => child.kill('SIGKILL'), 5_000);
    try {
      await closed;
    } finally {
      clearTimeout(kill);
    }
  }
  await rm(temporary, { recursive: true, force: true });
}
