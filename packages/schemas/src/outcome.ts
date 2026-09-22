import { z } from 'zod';

export const FailureCode = z.enum([
  'locator_not_found',
  'assertion_failed',
  'extraction_failed',
  'type_coercion_failed',
  'navigation_failed',
  'session_expired',
  'unexpected_dialog',
  'app_error',
  'approval_required',
  'policy_denied',
  'timeout',
  'step_budget_exhausted',
]);
export type FailureCode = z.infer<typeof FailureCode>;

export const Recovery = z.object({
  kind: z.enum(['retried_read', 'dismissed_interstitial']),
  atStepId: z.string().min(1).optional(),
  detail: z.string().min(1),
});
export type Recovery = z.infer<typeof Recovery>;

export const Outcome = z.discriminatedUnion('classification', [
  z.object({
    classification: z.literal('success'),
    outputs: z.record(z.string(), z.unknown()),
  }),
  // A member number that matches nobody is a correct answer, not a broken run.
  // Keeping this apart from `failed` is what stops the not-found path from
  // looking like an incident.
  z.object({
    classification: z.literal('business_outcome'),
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  // A run that reached its outputs, but not on the first attempt. The caller
  // gets the same outputs a success carries; `recoveries` is what separates it
  // from one, and says which condition was cleared rather than only that one was.
  z.object({
    classification: z.literal('recovered'),
    recoveredFrom: FailureCode,
    attempts: z.number().int().positive(),
    recoveries: z.array(Recovery).default([]),
    outputs: z.record(z.string(), z.unknown()),
  }),
  z.object({
    classification: z.literal('failed'),
    failureCode: FailureCode,
    message: z.string().min(1),
    failedAtStepId: z.string().min(1).optional(),
    interventionRaised: z.boolean(),
  }),
]);
export type Outcome = z.infer<typeof Outcome>;
