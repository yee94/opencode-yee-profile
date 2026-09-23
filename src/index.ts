import { Plugin } from '@opencode/plugin';
import { parseOptions } from './options.js';
import { registerAgents } from './register.js';
import { v1Server } from './v1.js';

export default {
  ...Plugin.define({
    id: '@yee94/opencode-profile',
    async setup(context) {
      const options = parseOptions(context.options);
      await context.agent.transform((editor) =>
        registerAgents(editor, options),
      );
    },
  }),
  server: v1Server,
};
