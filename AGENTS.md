# Project boundaries

Keep Build native: profile output must not set its system prompt or install runtime hooks.
Keep specialist prompt bodies in `src/prompts/*.md`, imported by `src/agents.ts` and inlined at build time; configuration owns permissions.
Register agents through the V2 agent transform or the V1 startup config callback; leave configuration files and session messages untouched.
Use `pnpm check` before delivery. Test prompt budgets, permissions, and preservation of native Build.
Preserve unrelated user content and comments. Test V1 and V2 host integration in isolated environments.
