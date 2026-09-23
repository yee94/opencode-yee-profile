import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '@opencode/plugin';
import { Host } from '@opencode/plugin/host';

const root = fileURLToPath(new URL('..', import.meta.url));
const sandbox = await mkdtemp(join(tmpdir(), 'yee-profile-smoke-'));
let plugin;
try {
  for (const path of ['dist', 'index.js', 'package.json']) {
    await cp(join(root, path), join(sandbox, path), { recursive: true });
  }
  await symlink(
    join(root, 'node_modules'),
    join(sandbox, 'node_modules'),
    'dir',
  );
  const isolated = Host.resolve({ directory: sandbox });
  assert.ok(isolated.server);
  plugin = (await Host.load(isolated.server)).default;
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

const manifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
assert.equal(
  manifest.bin,
  undefined,
  'This package must remain a plugin, not a CLI.',
);
assert.equal(manifest.exports['.'], './dist/index.mjs');
assert.equal(plugin.id, 'opencode-yee-profile');
const entrypoints = Host.resolve({
  directory: fileURLToPath(new URL('..', import.meta.url)),
});
assert.ok(
  entrypoints.server,
  'The host must discover the plugin from its directory.',
);
assert.equal((await Host.load(entrypoints.server)).default.id, plugin.id);

const agents = new Map(
  ['build', 'explore'].map((name) => [
    name,
    Agent.Info.default(Agent.ID.make(name)),
  ]),
);
const build = structuredClone(agents.get('build'));
let registrations = 0;
let selected;
await plugin.setup({
  options: {
    agents: { designer: { model: 'example/model#high' } },
  },
  agent: {
    async transform(callback) {
      registrations++;
      callback({
        get: (id) => agents.get(id),
        default: (id) => {
          selected = id;
        },
        remove: (id) => agents.delete(id),
        update(id, update) {
          const draft = agents.get(id) ?? Agent.Info.default(Agent.ID.make(id));
          update(draft);
          agents.set(id, draft);
        },
      });
      return { dispose: async () => {} };
    },
  },
});
assert.equal(registrations, 1);
assert.equal(selected, 'build');
assert.deepEqual(agents.get('build'), build);
for (const name of ['explore', 'oracle', 'designer']) {
  const source = await readFile(
    new URL(`../src/prompts/${name}.md`, import.meta.url),
    'utf8',
  );
  assert.equal(agents.get(name).system, source.trim());
}
assert.equal(agents.get('designer').model.variant, 'high');
console.log(
  'Built plugin smoke passed: native Build preserved; one transform; model variant works; all Markdown prompts inlined and loaded without source files.',
);
