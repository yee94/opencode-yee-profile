import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const executable =
  process.argv.slice(2).find((argument) => argument !== '--') || 'opencode';
const temporaryRoot = join(tmpdir(), 'opencode');
await mkdir(temporaryRoot, { recursive: true });
const temporary = await mkdtemp(join(temporaryRoot, 'yee-profile-host-'));
const project = join(temporary, 'project');
const password = randomUUID();
const pluginPath =
  process.env.PROFILE_PLUGIN_PATH ||
  fileURLToPath(new URL('..', import.meta.url));
const environment = {
  PATH: process.env.PATH,
  HOME: join(temporary, 'home'),
  TMPDIR: process.env.TMPDIR || tmpdir(),
  XDG_CONFIG_HOME: join(temporary, 'config'),
  XDG_DATA_HOME: join(temporary, 'data'),
  XDG_STATE_HOME: join(temporary, 'state'),
  XDG_CACHE_HOME: join(temporary, 'cache'),
  OPENCODE_CONFIG_DIR: join(temporary, 'config', 'opencode'),
  NO_COLOR: '1',
  OPENCODE_SERVER_PASSWORD: password,
};

// Sanitize this test process before importing service discovery or spawning a host.
for (const name of Object.keys(process.env)) delete process.env[name];
Object.assign(process.env, environment);
const { OpenCode } = await import('@opencode/client');
const location = { directory: project };
let child;

async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'exit');
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000);
  try {
    await closed;
  } finally {
    clearTimeout(timeout);
  }
}

async function start() {
  child = spawn(
    executable,
    ['serve', '--hostname', '127.0.0.1', '--port', '0'],
    {
      cwd: project,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const baseUrl = await new Promise((resolve, reject) => {
    let logs = '';
    const timeout = setTimeout(
      () => reject(new Error(`V2 startup timed out:\n${logs}`)),
      30_000,
    );
    const receive = (chunk) => {
      logs += chunk.toString();
      const match = logs.match(/listening on (http:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    };
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`V2 exited (${code}):\n${logs}`));
    });
  });
  return OpenCode.make({
    baseUrl,
    headers: {
      authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`,
      'x-opencode-directory': encodeURIComponent(project),
    },
  });
}

try {
  await Promise.all(
    [project, environment.HOME, environment.OPENCODE_CONFIG_DIR].map((path) =>
      mkdir(path, { recursive: true }),
    ),
  );
  await writeFile(
    join(environment.OPENCODE_CONFIG_DIR, 'opencode.json'),
    JSON.stringify({
      permissions: [{ action: '*', resource: '*', effect: 'allow' }],
      agents: { 'smoke-ready': { hidden: true } },
    }),
  );
  let client = await start();
  await client.session.create({ location });
  async function waitForAgents(requiredID) {
    const deadline = Date.now() + 20_000;
    let agents;
    let previous;
    let stable = 0;
    do {
      agents = new Map(
        (await client.agent.list({ location })).data.map((agent) => [
          agent.id,
          agent,
        ]),
      );
      const snapshot = JSON.stringify([...agents]);
      stable = snapshot === previous ? stable + 1 : 0;
      previous = snapshot;
      if (agents.has(requiredID) && agents.has('smoke-ready') && stable >= 3)
        return agents;
      await delay(100);
    } while (Date.now() < deadline);
    throw new Error(
      `Host registry did not publish ${requiredID}; agents: ${[...agents.keys()].join(', ')}`,
    );
  }
  const baseline = await waitForAgents('build');
  assert.equal(
    baseline.has('orchestrator'),
    false,
    'Global configuration leaked into the smoke test',
  );

  await writeFile(
    join(project, 'opencode.json'),
    JSON.stringify({
      ...JSON.parse(
        await readFile(
          new URL('../examples/permissions.v2.json', import.meta.url),
          'utf8',
        ),
      ),
      plugins: [
        {
          package: pluginPath,
          options: {
            agents: {
              general: { model: 'example/coder#high' },
              designer: { model: 'example/model#high' },
            },
          },
        },
      ],
    }),
  );
  await stop();
  client = await start();
  await client.session.create({ location });
  const installed = await waitForAgents('designer');
  assert.deepEqual(
    installed.get('build'),
    baseline.get('build'),
    'The plugin modified native Build',
  );
  assert.equal(installed.get('oracle')?.mode, 'subagent');
  assert.equal(installed.get('general')?.mode, 'subagent');
  assert.match(
    installed.get('general')?.system ?? '',
    /scoped engineering task/,
  );
  assert.equal(installed.get('general')?.model?.variant, 'high');
  for (const name of ['general', 'designer']) {
    assert.equal(
      installed
        .get(name)
        ?.permissions.findLast(
          (rule) =>
            ['*', 'subagent'].includes(rule.action) && rule.resource === '*',
        )?.effect,
      'deny',
      `Global allow must not reopen ${name} delegation`,
    );
  }
  assert.equal(installed.get('designer')?.mode, 'subagent');
  assert.equal(installed.get('designer')?.model?.variant, 'high');
  assert.match(
    installed.get('explore')?.description ?? '',
    /file:line evidence/,
  );
  for (const name of ['explore', 'oracle']) {
    const permissions = installed.get(name)?.permissions ?? [];
    for (const action of [
      'edit',
      'shell',
      'execute',
      'subagent',
      'future_mcp_write',
    ]) {
      assert.equal(
        permissions.findLast(
          (rule) =>
            (rule.action === action || rule.action === '*') &&
            rule.resource === '*',
        )?.effect,
        'deny',
        `Global allow must not reopen ${name} ${action}`,
      );
    }
    for (const action of ['read', 'glob', 'grep']) {
      assert.equal(
        permissions.findLast(
          (rule) =>
            (rule.action === action || rule.action === '*') &&
            rule.resource === '*',
        )?.effect,
        'allow',
      );
    }
  }
  const configPath = join(project, 'opencode.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  delete config.agents.oracle;
  config.plugins[0].options.agents.oracle = false;
  const disabledConfig = JSON.stringify(config);
  await writeFile(configPath, disabledConfig);
  await stop();
  client = await start();
  await client.session.create({ location });
  const disabled = await waitForAgents('designer');
  assert.equal(disabled.has('oracle'), false);
  assert.deepEqual(disabled.get('build'), baseline.get('build'));
  assert.equal(await readFile(configPath, 'utf8'), disabledConfig);
  console.log(
    'Real V2 host smoke passed: Build unchanged; model options and configured specialist permissions survive global allow. No model requests.',
  );
} finally {
  await stop();
  await rm(temporary, { recursive: true, force: true });
}
