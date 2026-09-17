import { z } from 'zod';

export const FailureCode = z.enum([
  'locator_not_found',
  'assertion_failed',
  'extraction_failed',
  'type_coercion_failed',
  'navigation_failed',
  'session_expired',
  'policy_denied',
  'timeout',
  'step_budget_exhausted',
]);
export type FailureCode = z.infer<typeof FailureCode>;

const extractedOutputs = z.record(z.string(), z.unknown());

export const SuccessOutcome = z.object({
  classification: z.literal('success'),
  outputs: extractedOutputs,
});

// A member number that matches nobody is a correct answer, not a broken run.
// Keeping this apart from `failed` is what stops the not-found path from
// looking like an incident.
export const BusinessOutcome = z.object({
  classification: z.literal('business_outcome'),
  code: z.string().min(1),
  message: z.string().min(1),
});

export const RecoveredOutcome = z.object({
  classification: z.literal('recovered'),
  recoveredFrom: FailureCode,
  attempts: z.number().int().positive(),
  outputs: extractedOutputs,
});

export const FailedOutcome = z.object({
  classification: z.literal('failed'),
  failureCode: FailureCode,
  message: z.string().min(1),
  failedAtStepId: z.string().min(1).optional(),
  interventionRaised: z.boolean(),
});

export const Outcome = z.discriminatedUnion('classification', [
  SuccessOutcome,
  BusinessOutcome,
  RecoveredOutcome,
  FailedOutcome,
]);
export type Outcome = z.infer<typeof Outcome>;
