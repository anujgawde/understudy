import { z } from 'zod';

export const ActionClass = z.enum(['read', 'navigate', 'mutate']);
export type ActionClass = z.infer<typeof ActionClass>;

export const PolicyDecision = z.enum(['allow', 'confirm', 'deny']);
export type PolicyDecision = z.infer<typeof PolicyDecision>;

export const PolicyRule = z.object({
  actionClass: ActionClass,
  decision: PolicyDecision,
});

export const Policy = z.object({
  policyId: z.string().min(1),
  name: z.string().min(1),
  // Navigation outside these origins is refused as a policy event rather than
  // attempted and failed, so the run log records why instead of what broke.
  allowedOrigins: z.array(z.url()).min(1),
  rules: z.array(PolicyRule).min(1),
  redactedFieldNames: z.array(z.string().min(1)),
  redactedPatterns: z.array(z.string().min(1)),
  maxStepsPerRun: z.number().int().positive(),
});
export type Policy = z.infer<typeof Policy>;
