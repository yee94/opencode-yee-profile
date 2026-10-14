import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { startModelFixture } from './fixtures/model.mjs';

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
const model = await startModelFixture();
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
      ...model.config,
      permissions: [{ action: '*', resource: '*', effect: 'allow' }],
      agents: { 'smoke-ready': { hidden: true } },
    }),
  );
  await writeFile(join(project, 'fixture.txt'), 'original\n');
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
  async function run(sessionID, text) {
    await client.session.prompt({ sessionID, text });
    await client.session.wait(
      { sessionID },
      { signal: AbortSignal.timeout(45_000) },
    );
  }
  const native = await client.session.create({ location, agent: 'build' });
  await run(native.id, 'fixture:known Read fixture.txt directly.');
  const nativeRequest = model.requests.find((request) =>
    request.tools?.some((tool) => tool.function.name === 'read'),
  );
  assert.ok(
    nativeRequest,
    'Native Build did not reach the local model fixture',
  );

  await writeFile(
    join(project, 'opencode.json'),
    JSON.stringify({
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
  assert.equal(installed.get('designer')?.mode, 'subagent');
  assert.equal(installed.get('designer')?.model?.variant, 'high');
  assert.match(
    installed.get('explore')?.description ?? '',
    /file:line evidence/,
  );
  const parent = await client.session.create({ location, agent: 'build' });
  for (const name of ['explore', 'oracle', 'general', 'designer']) {
    const child = await client.session.create({
      location,
      parentID: parent.id,
      agent: name,
    });
    await client.session.update({
      sessionID: child.id,
      permissions: [{ action: '*', resource: '*', effect: 'allow' }],
    });
    await client.session.prompt({
      sessionID: child.id,
      text: 'Inspect the fixture',
      resume: false,
    });
    const { permissions } = await client.session.get({ sessionID: child.id });
    if (name === 'general' || name === 'designer') {
      assert.equal(permissions.at(-1).action, 'subagent');
      assert.equal(permissions.at(-1).effect, 'deny');
      continue;
    }
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
  await run(
    parent.id,
    'fixture:broad Explore the unfamiliar fixture module across files.',
  );
  assert.deepEqual(model.failures, []);
  assert.equal(
    await readFile(join(project, 'fixture.txt'), 'utf8'),
    'original\n',
  );
  const messages = await client.session.context({ sessionID: parent.id });
  assert.ok(
    JSON.stringify(messages).includes(
      'Fixture exploration and resumed-write probe completed.',
    ),
    JSON.stringify(messages),
  );
  const systemText = (request) =>
    request.messages
      .filter((message) => ['system', 'developer'].includes(message.role))
      .map((message) => JSON.stringify(message.content))
      .join('\n');
  const exploration = model.requests.filter((request) =>
    systemText(request).includes('# Explore'),
  );
  assert.ok(
    exploration.length >= 4,
    'Expected initial and resumed Explore model calls',
  );
  for (const request of exploration) {
    const names = request.tools.map((tool) => tool.function.name);
    for (const blocked of ['patch', 'shell', 'execute', 'subagent'])
      assert.ok(!names.includes(blocked), `Explore exposes ${blocked}`);
    assert.ok(names.includes('read'));
    assert.ok(!systemText(request).includes('## Exploration delegation'));
  }
  const buildRequests = model.requests.filter((request) =>
    systemText(request).includes('## Exploration delegation'),
  );
  const routing = (
    await readFile(
      new URL('../src/prompts/build-routing.md', import.meta.url),
      'utf8',
    )
  ).trim();
  assert.ok(
    buildRequests.length >= 3,
    'Build routing missing from the native delegation loop',
  );
  for (const request of buildRequests) {
    assert.equal(
      systemText(request).split('## Exploration delegation').length - 1,
      1,
    );
    assert.ok(
      request.tools.some((tool) => tool.function.name === 'patch'),
      'Build lost native editing tools',
    );
    assert.deepEqual(
      request.messages[0],
      {
        ...nativeRequest.messages[0],
        content: `${nativeRequest.messages[0].content}\n${routing}`,
      },
      'Build must preserve the complete native provider prompt and append only the fixed routing block',
    );
  }
  const childID = JSON.stringify(messages)
    .match(/ses_[a-zA-Z0-9]+/g)
    ?.find((id) => id !== parent.id);
  assert.ok(childID, 'Missing native child session');
  await run(childID, 'fixture:shell Write the repair using shell instead.');
  assert.equal(
    await readFile(join(project, 'fixture.txt'), 'utf8'),
    'original\n',
  );
  const known = await client.session.create({ location, agent: 'build' });
  await run(known.id, 'fixture:known Read fixture.txt directly.');
  const knownMessages = JSON.stringify(
    await client.session.context({ sessionID: known.id }),
  );
  assert.ok(knownMessages.includes('original'));
  assert.ok(!knownMessages.includes('"tool":"subagent"'));
  const configPath = join(project, 'opencode.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.plugins[0].options.agents.oracle = false;
  config.plugins[0].options.agents.explore = false;
  const disabledConfig = JSON.stringify(config);
  await writeFile(configPath, disabledConfig);
  await stop();
  client = await start();
  await client.session.create({ location });
  const disabled = await waitForAgents('designer');
  assert.equal(disabled.has('oracle'), false);
  assert.equal(disabled.has('explore'), false);
  assert.deepEqual(disabled.get('build'), baseline.get('build'));
  assert.equal(await readFile(configPath, 'utf8'), disabledConfig);
  const off = await client.session.create({ location, agent: 'build' });
  const requestCount = model.requests.length;
  await run(off.id, 'fixture:known Read fixture.txt directly.');
  assert.ok(
    model.requests
      .slice(requestCount)
      .every(
        (request) => !systemText(request).includes('## Exploration delegation'),
      ),
  );
  console.log(
    'Real V2 host smoke passed: native Build preserved; internal child permissions survive global allow; routing delivered; native Explore read and resumed patch denial verified with a local model fixture. No external model requests.',
  );
} finally {
  await stop();
  await model.close();
  await rm(temporary, { recursive: true, force: true });
}
