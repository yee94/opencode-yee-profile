import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'markdown-text',
      enforce: 'pre',
      async load(id) {
        if (id.endsWith('.md')) {
          const text = await readFile(id, 'utf8');
          return `export default ${JSON.stringify(text)};`;
        }
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
