import { Agent } from '@opencode/plugin';
import type { AgentEditor } from '@opencode/plugin/promise/agent';

type MutableAgent = NonNullable<ReturnType<AgentEditor['get']>>;

export function createAgent(name: string): MutableAgent {
  return Agent.Info.default(Agent.ID.make(name));
}

export function createEditor(seed: MutableAgent[] = []) {
  const agents = new Map<string, MutableAgent>();
  for (const name of [
    'build',
    'plan',
    'general',
    'explore',
    'compaction',
    'title',
    'summary',
  ]) {
    agents.set(name, createAgent(name));
  }
  for (const agent of seed)
    agents.set(String(agent.id), structuredClone(agent));
  let defaultAgent: string | undefined;
  const editor: AgentEditor = {
    list: () => [...agents.values()],
    get: (id) => agents.get(id),
    default: (id) => {
      defaultAgent = id;
    },
    update: (id, update) => {
      const draft = structuredClone(agents.get(id) ?? createAgent(id));
      update(draft);
      agents.set(id, draft);
    },
    remove: (id) => {
      agents.delete(id);
    },
  };
  return { editor, agents, getDefault: () => defaultAgent };
}
