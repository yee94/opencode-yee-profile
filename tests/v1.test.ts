import type { PluginInput } from '@opencode-ai/plugin';
import type { Config } from '@opencode-ai/sdk/v2';
import { describe, expect, it } from 'vitest';
import { specialists } from '../src/agents.js';
import plugin from '../src/index.js';
import { agentNames, parseOptions } from '../src/options.js';
import { registerV1Agents } from '../src/v1.js';

describe('V1 adapter', () => {
  it('exposes only a startup config callback and does not use the runtime context', async () => {
    const context = new Proxy({} as PluginInput, {
      get(_target, key) {
        throw new Error(`Unexpected runtime access: ${String(key)}`);
      },
    });
    const hooks = await plugin.server(context, {});
    expect(Object.keys(hooks)).toEqual(['config']);
    const config: Parameters<NonNullable<typeof hooks.config>>[0] = {};
    await hooks.config?.(config);
    expect(config.agent?.general?.prompt).toBe(specialists.general.system);
    await expect(plugin.server(context, { typo: true })).rejects.toThrow(
      'Invalid @yee94/opencode-profile options',
    );
  });

  it('preserves Build and unrelated user configuration and is idempotent', () => {
    const config: Config = {
      model: 'existing/main',
      default_agent: 'plan',
      permission: { bash: 'ask' },
      agent: {
        build: {
          prompt: 'Native user instructions',
          model: 'existing/build',
          variant: 'high',
          permission: { edit: 'ask' },
        },
        plan: { description: 'User plan', hidden: true },
        custom: { prompt: 'Untouched', options: { custom: true } },
      },
    };
    const before = structuredClone(config);
    registerV1Agents(config, parseOptions({}));
    expect(config).toMatchObject({
      ...before,
      default_agent: 'build',
    });
    for (const name of agentNames) {
      expect(config.agent?.[name]).toMatchObject({
        mode: 'subagent',
        hidden: false,
        disable: false,
        prompt: specialists[name].system,
        description: specialists[name].description,
      });
    }
    const first = structuredClone(config);
    registerV1Agents(config, parseOptions({}));
    expect(config).toEqual(first);
  });

  it('preserves model settings unless overridden, and splits V1 variants correctly', () => {
    const config: Config = {
      agent: {
        oracle: { model: 'existing/reviewer', variant: 'low' },
        general: { model: 'existing/coder', variant: 'low', color: '#123456' },
      },
    };
    registerV1Agents(
      config,
      parseOptions({
        agents: { general: { model: 'chosen/model/path#high' } },
      }),
    );
    expect(config.agent?.oracle?.model).toBe('existing/reviewer');
    expect(config.agent?.oracle?.variant).toBe('low');
    expect(config.agent?.general).toMatchObject({
      model: 'chosen/model/path',
      variant: 'high',
      color: '#123456',
    });
    expect(config.agent?.explore?.model).toBeUndefined();
    registerV1Agents(
      config,
      parseOptions({ agents: { general: { model: 'chosen/another' } } }),
    );
    expect(config.agent?.general?.variant).toBeUndefined();
  });

  it.each(agentNames)('disables %s, including native entries', (name) => {
    const config: Config = { agent: { [name]: { color: '#123456' } } };
    registerV1Agents(config, parseOptions({ agents: { [name]: false } }));
    expect(config.agent?.[name]).toEqual({ color: '#123456', disable: true });
  });

  it.each([
    'explore',
    'oracle',
  ])('replaces conflicting permissions with a read-only whitelist for %s', (name) => {
    const config: Config = {
      permission: { '*': 'allow' },
      agent: { [name]: { permission: { bash: 'allow', task: 'allow' } } },
    };
    registerV1Agents(config, parseOptions({}));
    expect(config.agent?.[name]?.permission).toEqual({
      '*': 'deny',
      read: {
        '*': 'allow',
        '*.env': 'ask',
        '*.env.*': 'ask',
        '*.env.example': 'allow',
      },
      glob: 'allow',
      grep: 'allow',
      external_directory: 'ask',
    });
    expect(config.permission).toEqual({ '*': 'allow' });
  });

  it.each([
    'general',
    'designer',
  ])('preserves %s permissions but makes task denial the last rule', (name) => {
    const config: Config = {
      agent: {
        [name]: {
          permission: {
            task: { '*': 'allow' },
            '*': 'allow',
            bash: { 'git push *': 'deny' },
          },
        },
      },
    };
    registerV1Agents(config, parseOptions({}));
    const permission = config.agent?.[name]?.permission;
    expect(permission).toEqual({
      '*': 'allow',
      bash: { 'git push *': 'deny' },
      task: 'deny',
    });
    expect(Object.keys(permission ?? {}).at(-1)).toBe('task');
  });

  it('preserves shorthand permission restrictions for executors', () => {
    const config: Config = { agent: { general: { permission: 'ask' } } };
    registerV1Agents(config, parseOptions({}));
    expect(config.agent?.general?.permission).toEqual({
      '*': 'ask',
      task: 'deny',
    });
  });

  it.each([
    { disable: true },
    { hidden: true },
    { mode: 'subagent' as const },
  ])('fails before mutation when Build is unavailable: %j', (build) => {
    const config: Config = { agent: { build } };
    const before = structuredClone(config);
    expect(() => registerV1Agents(config, parseOptions({}))).toThrow(
      'requires the native',
    );
    expect(config).toEqual(before);
  });
});
