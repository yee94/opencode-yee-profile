import { Model } from '@opencode/plugin';
import type { AgentEditor } from '@opencode/plugin/promise/agent';
import { readOnlyPermissions, specialists } from './agents.js';
import { agentNames, type Options } from './options.js';

export function registerAgents(editor: AgentEditor, options: Options): void {
  const build = editor.get('build');
  if (!build || build.hidden || build.mode === 'subagent') {
    throw new Error(
      '@yee94/opencode-profile requires the native, visible Build primary agent. Enable Build before loading this plugin.',
    );
  }

  editor.default('build');
  for (const name of agentNames) {
    const settings = options.agents[name];
    if (settings === false) {
      editor.remove(name);
      continue;
    }
    const specialist = specialists[name];
    editor.update(name, (agent) => {
      agent.mode = 'subagent';
      agent.hidden = false;
      agent.description = specialist.description;
      agent.system = specialist.system;
      if (settings?.model) agent.model = Model.Ref.parse(settings.model);
      if (specialist.readonly) {
        agent.permissions = readOnlyPermissions();
      } else {
        agent.permissions = [
          ...agent.permissions.filter((rule) => rule.action !== 'subagent'),
          { action: 'subagent', resource: '*', effect: 'deny' },
        ];
      }
    });
  }
}
