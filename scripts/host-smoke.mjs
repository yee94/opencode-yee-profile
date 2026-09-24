import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
const serviceFile = join(temporary, 'state', 'opencode', 'service-v2.json');
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
};

// Sanitize this test process before importing service discovery or spawning a host.
for (const name of Object.keys(process.env)) delete process.env[name];
Object.assign(process.env, environment);
const { OpenCode } = await import('@opencode/client');
const { Service } = await import('@opencode/client/service');
const location = { directory: project };

try {
  await Promise.all(
    [project, environment.HOME, environment.OPENCODE_CONFIG_DIR].map((path) =>
      mkdir(path, { recursive: true }),
    ),
  );
  const startOptions = {
    file: serviceFile,
    command: [executable, 'serve', '--service', '--port', '0'],
  };
  let endpoint = await Service.ensure(startOptions);
  let client = OpenCode.make({
    baseUrl: endpoint.url,
    headers: {
      ...Service.headers(endpoint),
      'x-opencode-directory': encodeURIComponent(project),
    },
  });
  await client.session.create({ location });
  async function waitForAgents(requiredID) {
    const deadline = Date.now() + 20_000;
    let agents;
    do {
      agents = new Map(
        (await client.agent.list({ location })).data.map((agent) => [
          agent.id,
          agent,
        ]),
      );
      if (agents.has(requiredID)) return agents;
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
      plugins: [
        {
          package: pluginPath,
          options: {
            agents: {
              oracle: false,
              general: { model: 'example/coder#high' },
              designer: { model: 'example/model#high' },
            },
          },
        },
      ],
    }),
  );
  await Service.stop({ file: serviceFile });
  endpoint = await Service.ensure(startOptions);
  client = OpenCode.make({
    baseUrl: endpoint.url,
    headers: {
      ...Service.headers(endpoint),
      'x-opencode-directory': encodeURIComponent(project),
    },
  });
  await client.session.create({ location });
  const installed = await waitForAgents('designer');
  assert.deepEqual(
    installed.get('build'),
    baseline.get('build'),
    'The plugin modified native Build',
  );
  assert.equal(installed.has('oracle'), false);
  assert.equal(installed.get('general')?.mode, 'subagent');
  assert.match(
    installed.get('general')?.system ?? '',
    /scoped engineering task/,
  );
  assert.equal(installed.get('general')?.model?.variant, 'high');
  assert.deepEqual(installed.get('general')?.permissions.at(-1), {
    action: 'subagent',
    resource: '*',
    effect: 'deny',
  });
  assert.equal(installed.get('designer')?.mode, 'subagent');
  assert.equal(installed.get('designer')?.model?.variant, 'high');
  assert.match(
    installed.get('explore')?.description ?? '',
    /file:line evidence/,
  );
  console.log(
    'Real V2 host smoke passed: plugin loaded, Build unchanged, model and disable options applied. No model requests.',
  );
} finally {
  await Service.stop({ file: serviceFile });
  await rm(temporary, { recursive: true, force: true });
}
