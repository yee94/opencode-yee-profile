import { z } from 'zod';

export const agentNames = ['general', 'explore', 'oracle', 'designer'] as const;
export type AgentName = (typeof agentNames)[number];

const model = z
  .string()
  .regex(
    /^[^\s/#]+\/[^\s#]+(?:#[^\s#]+)?$/,
    'Expected provider/model or provider/model#variant',
  );

const agentOptions = z.union([
  z.literal(false),
  z.strictObject({ model: model.optional() }),
]);

export const optionsSchema = z.strictObject({
  agents: z
    .strictObject({
      general: agentOptions.optional(),
      explore: agentOptions.optional(),
      oracle: agentOptions.optional(),
      designer: agentOptions.optional(),
    })
    .default({}),
});

export type Options = z.infer<typeof optionsSchema>;

export function parseOptions(input: unknown): Options {
  const result = optionsSchema.safeParse(input ?? {});
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'options'}: ${issue.message}`,
    );
    throw new Error(
      `Invalid opencode-yee-profile options:\n${problems.join('\n')}`,
    );
  }
  return result.data;
}
