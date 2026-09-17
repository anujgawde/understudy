import { z } from 'zod';
import { Action, WaitCondition } from './action';

export const Step = z.object({
  stepId: z.string().min(1),
  action: Action,
  waitFor: WaitCondition.optional(),
  description: z.string().optional(),
});
export type Step = z.infer<typeof Step>;
