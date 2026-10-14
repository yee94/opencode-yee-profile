import type { Plugin } from '@opencode/plugin';
import type { SessionHooks } from '@opencode/plugin/promise/session';
import { specialists } from './agents.js';
import { type AgentName, agentNames, type Options } from './options.js';
import { constrainPermissions, permissionFor } from './permissions.js';
import routing from './prompts/build-routing.md';

export const buildRouting = routing.trim();

export function createRuntime(context: Plugin.Context, options: Options) {
  const managed = (name: string | undefined): name is AgentName =>
    agentNames.some(
      (agent) => agent === name && options.agents[agent] !== false,
    );

  async function enforce(
    sessionID: SessionHooks['prompt']['sessionID'],
    activeAgent?: string,
  ) {
    const session = await context.session.get({ sessionID });
    const name = activeAgent ?? session.agent;
    if (!session.parentID || !managed(name)) return;
    const existing = session.permissions ?? [];
    const source = specialists[name].readonly
      ? [
          ...(await context.agent.get({ agentID: name })).data.permissions,
          ...existing,
        ]
      : existing;
    const permissions = constrainPermissions(
      source,
      specialists[name].readonly,
    );
    if (JSON.stringify(permissions) === JSON.stringify(existing)) return;
    await context.session.update({ sessionID, permissions });
  }

  return {
    prompt: async (event: SessionHooks['prompt']) => enforce(event.sessionID),
    context: async (event: SessionHooks['context']) => {
      if (managed(event.agent)) await enforce(event.sessionID, event.agent);
      if (
        event.agent !== 'build' ||
        options.agents.explore === false ||
        !event.tools.subagent
      )
        return;
      const { data: agents } = await context.agent.list();
      const explore = agents.find((agent) => agent.id === 'explore');
      if (!explore || explore.hidden || explore.mode === 'primary') return;
      const build = agents.find((agent) => agent.id === 'build');
      const session = await context.session.get({ sessionID: event.sessionID });
      if (
        permissionFor(
          [...(build?.permissions ?? []), ...(session.permissions ?? [])],
          'subagent',
          'explore',
        ) === 'deny'
      )
        return;
      if (!event.system.some((part) => part.text === buildRouting)) {
        event.system.push({ type: 'text', text: buildRouting });
      }
    },
  };
}
