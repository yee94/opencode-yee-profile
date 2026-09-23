import { Plugin } from '@opencode/plugin';
import { parseOptions } from './options.js';
import { registerAgents } from './register.js';

export default Plugin.define({
  id: 'opencode-yee-profile',
  async setup(context) {
    const options = parseOptions(context.options);
    await context.agent.transform((editor) => registerAgents(editor, options));
  },
});
