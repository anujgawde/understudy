import { z } from 'zod';
import { LocatorLadder } from './locator';

export const WaitCondition = z.discriminatedUnion('waitUntil', [
  z.object({ waitUntil: z.literal('pageLoad') }),
  z.object({ waitUntil: z.literal('selectorPresent'), selector: z.string().min(1) }),
  z.object({ waitUntil: z.literal('textPresent'), text: z.string().min(1) }),
  z.object({ waitUntil: z.literal('fixedDelay'), milliseconds: z.number().int().positive() }),
]);
export type WaitCondition = z.infer<typeof WaitCondition>;

export const Action = z.discriminatedUnion('actionType', [
  z.object({ actionType: z.literal('navigate'), url: z.url() }),
  z.object({ actionType: z.literal('click'), target: LocatorLadder }),
  z.object({ actionType: z.literal('fill'), target: LocatorLadder, value: z.string() }),
]);
export type Action = z.infer<typeof Action>;
