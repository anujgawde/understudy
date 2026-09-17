import { z } from 'zod';

const matchIndex = z.number().int().nonnegative().optional();

export const Locator = z.discriminatedUnion('strategy', [
  z.object({
    strategy: z.literal('role'),
    role: z.string().min(1),
    accessibleName: z.string().min(1).optional(),
    matchIndex,
  }),
  z.object({
    strategy: z.literal('text'),
    text: z.string().min(1),
    matchExactly: z.boolean().optional(),
    matchIndex,
  }),
  // Target pages label their inputs with bare `<td>` cells rather than
  // `<label for>`, so the accessible name is empty and role lookup cannot find
  // them. This walks from the label's own cell to the neighbouring one instead.
  z.object({
    strategy: z.literal('adjacent'),
    labelText: z.string().min(1),
    direction: z.enum(['next', 'below']),
    targetRole: z.string().min(1).optional(),
    matchIndex,
  }),
  z.object({
    strategy: z.literal('css'),
    selector: z.string().min(1),
    matchIndex,
  }),
]);
export type Locator = z.infer<typeof Locator>;

// Ordered most durable first; the resolver takes the first strategy that
// matches. Capped at 3 because the recorder dedupes down to that in step 21.
export const LocatorLadder = z.array(Locator).min(1).max(3);
export type LocatorLadder = z.infer<typeof LocatorLadder>;
