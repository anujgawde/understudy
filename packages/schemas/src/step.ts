import { z } from 'zod';
import { Action, WaitCondition } from './action';

// Whether performing this step again can be undone. A read, a navigation or a
// search is reversible; anything that posts, transfers, closes or confirms is
// not, and replay refuses to perform one unattended. Recorded per step rather
// than inferred at replay time, because the page that would tell you is the one
// you are about to change.
export const StepRisk = z.enum(['reversible', 'irreversible']);
export type StepRisk = z.infer<typeof StepRisk>;

export const Step = z.object({
  stepId: z.string().min(1),
  action: Action,
  waitFor: WaitCondition.optional(),
  description: z.string().optional(),
  risk: StepRisk.default('reversible'),
});
export type Step = z.infer<typeof Step>;
