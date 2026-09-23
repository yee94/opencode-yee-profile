import type { Agent } from '@opencode/plugin';
import designerPrompt from './prompts/designer.md';
import explorePrompt from './prompts/explore.md';
import generalPrompt from './prompts/general.md';
import oraclePrompt from './prompts/oracle.md';

export const specialists = {
  general: {
    description:
      'Execute a scoped engineering task: implement, verify, and report results. Use for delegated coding work with a clear outcome.',
    system: generalPrompt.trim(),
    readonly: false,
  },
  explore: {
    description:
      'Map unfamiliar code to file:line evidence. Skip for a known file or a single lookup.',
    system: explorePrompt.trim(),
    readonly: true,
  },
  oracle: {
    description:
      "Architecture-first review: OCP, Occam's razor, YAGNI, and justified extensibility. Focus on material structural costs, not speculative defenses or routine sign-off.",
    system: oraclePrompt.trim(),
    readonly: true,
  },
  designer: {
    description:
      'Design and implement UI changes; use for visual or interaction decisions, not backend work.',
    system: designerPrompt.trim(),
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
