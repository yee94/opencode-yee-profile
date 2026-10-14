import type { Agent } from '@opencode/plugin';

export type Permission = Agent.Info['permissions'][number];
const readOnlyActions = ['read', 'glob', 'grep', 'external_directory'];

export function matches(pattern: string, value: string): boolean {
  return new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '.*')
      .replaceAll('?', '.')}$`,
    's',
  ).test(value);
}

export function permissionFor(
  rules: readonly Permission[],
  action: string,
  resource: string,
): Permission['effect'] {
  return (
    rules.findLast(
      (rule) =>
        matches(rule.action, action) && matches(rule.resource, resource),
    )?.effect ?? 'ask'
  );
}

export function constrainPermissions(
  rules: readonly Permission[],
  readonly: boolean,
): Permission[] {
  const constrained: Permission[] = readonly
    ? [
        { action: '*', resource: '*', effect: 'deny' },
        ...rules.flatMap((rule) =>
          readOnlyActions
            .filter((action) => matches(rule.action, action))
            .map((action) => ({ ...rule, action })),
        ),
      ]
    : [...rules, { action: 'subagent', resource: '*', effect: 'deny' }];

  // Only the last identical action/resource can affect a last-match-wins policy.
  const seen = new Set<string>();
  return constrained
    .reverse()
    .filter((rule) => {
      const key = JSON.stringify([rule.action, rule.resource]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .reverse();
}
