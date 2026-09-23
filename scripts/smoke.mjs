import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Agent } from '@opencode/plugin';
import { Host } from '@opencode/plugin/host';
import plugin from '../dist/index.mjs';

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
    agents: { oracle: false, designer: { model: 'example/model#high' } },
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
assert.equal(agents.has('oracle'), false);
assert.equal(agents.get('designer').model.variant, 'high');
console.log(
  'Built plugin smoke passed: native Build preserved; one transform; model variant and disable option work.',
);
