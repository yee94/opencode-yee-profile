import type { Plugin } from '@opencode-ai/plugin';
import type { Config, PermissionRuleConfig } from '@opencode-ai/sdk/v2';
import { readOnlyPermissions, specialists } from './agents.js';
import { agentNames, type Options, parseOptions } from './options.js';

type AgentConfig = NonNullable<NonNullable<Config['agent']>[string]>;

function permissions(agent: AgentConfig, readonly: boolean) {
  if (!readonly) {
    const existing =
      typeof agent.permission === 'string'
        ? { '*': agent.permission }
        : agent.permission;
    const result = { ...existing };
    delete result.task;
    return { ...result, task: 'deny' as const };
  }

  const result: Record<string, PermissionRuleConfig> = {};
  for (const { action, resource, effect } of readOnlyPermissions()) {
    if (resource === '*') {
      result[action] = effect;
    } else {
      const previous = result[action];
      result[action] = {
        ...(typeof previous === 'string' ? { '*': previous } : previous),
        [resource]: effect,
      };
    }
  }
  return result;
}

export function registerV1Agents(
  config: Pick<Config, 'agent' | 'default_agent'>,
  options: Options,
): void {
  const build = config.agent?.build;
  if (build?.disable || build?.hidden || build?.mode === 'subagent') {
    throw new Error(
      '@yee94/opencode-profile requires the native, visible Build primary agent. Enable Build before loading this plugin.',
    );
  }

  config.default_agent = 'build';
  config.agent ??= {};
  for (const name of agentNames) {
    const settings = options.agents[name];
    const existing = config.agent[name] ?? {};
    if (settings === false) {
      config.agent[name] = { ...existing, disable: true };
      continue;
    }
    const specialist = specialists[name];
    const agent: AgentConfig = {
      ...existing,
      mode: 'subagent',
      hidden: false,
      disable: false,
      description: specialist.description,
      prompt: specialist.system,
      permission: permissions(existing, specialist.readonly),
    };
    if (settings?.model) {
      const [model, variant] = settings.model.split('#');
      agent.model = model;
      if (variant) agent.variant = variant;
      else delete agent.variant;
    }
    config.agent[name] = agent;
  }
}

export const v1Server: Plugin = async (_context, input) => {
  const options = parseOptions(input);
  return {
    config: async (config) => registerV1Agents(config, options),
  };
};
