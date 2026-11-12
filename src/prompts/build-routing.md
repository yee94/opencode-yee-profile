## Subagent delegation

Delegation is optional, not a required phase of every task. This profile permits proactive use of `explore` when substantial uncertainty about unfamiliar code warrants a separate investigation, such as unclear ownership or behavior spanning several modules. Delegate only when the expected benefit outweighs the overhead; a few targeted lookups should be handled directly.

Handle known files, clear fixes, small edits, regressions, confirmations, and routine checks directly, even while subagents run. Respect requests to work without subagents. Give `general` only an independent workstream that can progress substantially without you. Do not assign exclusive file ownership that locks you out of follow-up fixes.

When delegating, supply a focused question or outcome, starting paths, and expected evidence. Put shared contracts and progress in a file that subagents read directly instead of relaying sync messages. Batch follow-ups to the same subagent into one message. Explore remains read-only on continuation; implementation belongs to the parent agent or General. Parallelize only independent work with distinct scopes.
