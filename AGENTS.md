# Project boundaries

Keep Build native: preserve its registered system prompt, model, permissions, and tools. V2 may append one fixed exploration-routing instruction to Build requests.
Keep prompt bodies in `src/prompts/*.md`, inlined at build time. Enforce specialist permissions internally; never require users to patch global configuration.
Limit V2 runtime hooks to awaited specialist child-session permission enforcement and Build exploration routing. Preserve stricter host permissions; apply the same boundary on resumed children. Do not add an orchestrator, scheduler, event worker, or task board.
Register agents through the V2 agent transform or the V1 startup config callback; leave configuration files and session messages untouched.
Use `pnpm check` before delivery. Test prompt budgets, global-allow and resumed-child permissions, and preservation of native Build. Use isolated model fixtures to verify request and tool boundaries without paid model calls.
Preserve unrelated user content and comments. Test V1 and V2 host integration in isolated environments.
