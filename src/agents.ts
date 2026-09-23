import type { Agent } from '@opencode/plugin';

export const specialists = {
  explore: {
    description:
      'Map unfamiliar code to file:line evidence. Skip for a known file or a single lookup.',
    system:
      'Find the code that answers the question. Return file:line evidence and the relevant call path; stop when the question is answered, and label gaps.',
    readonly: true,
  },
  oracle: {
    description:
      'Independent judgment for consequential trade-offs or unresolved failures; not routine sign-off.',
    system:
      'Resolve the decision with the smallest sufficient evidence. Recommend one path, cite decisive code or facts, and state the trade-off and what would change your conclusion.',
    readonly: true,
  },
  designer: {
    description:
      'Design and implement UI changes; use for visual or interaction decisions, not backend work.',
    system:
      'Design and implement within the existing visual language. Make hierarchy, responsive behavior, accessibility, and interaction states intentional; verify the changed experience and report unverified states.',
    readonly: false,
  },
} as const;

type Permission = Agent.Info['permissions'][number];

export function readOnlyPermissions(): Permission[] {
  return [
    { action: '*', resource: '*', effect: 'deny' },
    ...['read', 'glob', 'grep'].map(
      (action): Permission => ({ action, resource: '*', effect: 'allow' }),
    ),
    { action: 'external_directory', resource: '*', effect: 'ask' },
    { action: 'read', resource: '*.env', effect: 'ask' },
    { action: 'read', resource: '*.env.*', effect: 'ask' },
    { action: 'read', resource: '*.env.example', effect: 'allow' },
  ];
}
