import { z } from 'zod';

export const ActionClass = z.enum(['read', 'navigate', 'mutate']);
export type ActionClass = z.infer<typeof ActionClass>;

export const PolicyDecision = z.enum(['allow', 'confirm', 'deny']);
export type PolicyDecision = z.infer<typeof PolicyDecision>;

export const Policy = z.object({
  policyId: z.string().min(1),
  name: z.string().min(1),
  // Navigation outside these origins is refused as a policy event rather than
  // attempted and failed, so the run log records why instead of what broke.
  allowedOrigins: z.array(z.url()).min(1),
  rules: z.array(
    z.object({
      actionClass: ActionClass,
      decision: PolicyDecision,
    }),
  ).min(1),
  redactedFieldNames: z.array(z.string().min(1)),
  // Control labels whose click commits something that cannot be taken back.
  // Policy rather than code: which button is the point of no return is a fact
  // about the application, and differs between one tenant's build and the next.
  irreversibleControlLabels: z.array(z.string().min(1)).default([]),
  redactedPatterns: z.array(z.string().min(1)),
  maxStepsPerRun: z.number().int().positive(),
});
export type Policy = z.infer<typeof Policy>;

/**
 * Whether a control commits something that cannot be taken back, judged from
 * every name the page hangs on it — a submit button may carry its meaning in
 * its value attribute, its id, or the text beside it, and which one varies by
 * how the page was built.
 *
 * Lives beside the policy rather than in the recorder or the discovery loop
 * because both ask the same question of the same list, and the answer has to be
 * the same in both: a control that pauses replay for approval is the one
 * discovery should have asked about before pressing.
 */
export function namesIrreversibleControl(policy: Policy, names: Array<string | undefined>): boolean {
  const present = names.filter((name): name is string => name !== undefined && name !== '');

  return policy.irreversibleControlLabels.some((label) => {
    const needle = label.toLowerCase();
    return present.some((name) => name.toLowerCase().includes(needle));
  });
}
