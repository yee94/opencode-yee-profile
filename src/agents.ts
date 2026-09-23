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
      "Architecture-first review: OCP, Occam's razor, YAGNI, and justified extensibility. Focus on material structural costs, not speculative defenses or routine sign-off.",
    system:
      "Read project conventions; assess existing layers, ownership, reuse, and real requirements. Apply Occam's razor and YAGNI: the simplest sufficient design with justified OCP extension points, not speculative frameworks. Accept reasonable trade-offs and necessary safeguards. Report only material issues with file:line evidence, costs, and minimal compatible fixes; otherwise approve and stop.",
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
