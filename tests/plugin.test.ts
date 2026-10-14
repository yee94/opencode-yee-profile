import type { Plugin } from '@opencode/plugin';
import type { AgentEditor } from '@opencode/plugin/promise/agent';
import { describe, expect, it, vi } from 'vitest';
import plugin from '../src/index.js';
import { createEditor } from './fixture.js';

describe('plugin entry', () => {
  it('registers one agent transform and only the two scoped session hooks', async () => {
    const { editor, agents } = createEditor();
    const transform = vi.fn(async (callback: (editor: AgentEditor) => void) => {
      callback(editor);
      return { dispose: async () => {} };
    });
    const hook = vi.fn(async () => ({ dispose: async () => {} }));
    const context = new Proxy(
      { options: {}, agent: { transform }, session: { hook } },
      {
        get(target, key) {
          if (key === 'options' || key === 'agent' || key === 'session')
            return target[key];
          throw new Error(`Unexpected runtime dependency: ${String(key)}`);
        },
      },
    );
    await plugin.setup(context as unknown as Plugin.Context);
    expect(transform).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      'prompt',
      'context',
    ]);
    expect(agents.has('designer')).toBe(true);
    expect(plugin.id).toBe('@yee94/opencode-profile');
  });

  it('rejects invalid options before registering anything', async () => {
    const transform = vi.fn();
    await expect(
      plugin.setup({
        options: { typo: true },
        agent: { transform },
      } as unknown as Plugin.Context),
    ).rejects.toThrow('Invalid @yee94/opencode-profile options');
    expect(transform).not.toHaveBeenCalled();
  });
});
