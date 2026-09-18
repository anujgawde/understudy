import { z } from 'zod';

export const ScreencastFrame = z.object({
  // Base64 JPEG straight from CDP, kept encoded so the frame can cross a
  // WebSocket to the console without a re-encode on either side.
  data: z.string().min(1),
  capturedAt: z.iso.datetime(),
});
export type ScreencastFrame = z.infer<typeof ScreencastFrame>;

// Coordinates are in page space, matching the frame the operator clicked on.
export const OperatorInput = z.discriminatedUnion('inputType', [
  z.object({
    inputType: z.literal('mouse_move'),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    inputType: z.literal('mouse_click'),
    x: z.number(),
    y: z.number(),
    button: z.enum(['left', 'middle', 'right']).default('left'),
    clickCount: z.number().int().positive().default(1),
  }),
  z.object({
    inputType: z.literal('scroll'),
    x: z.number(),
    y: z.number(),
    deltaX: z.number(),
    deltaY: z.number(),
  }),
  z.object({
    inputType: z.literal('key_press'),
    key: z.string().min(1),
  }),
  z.object({
    inputType: z.literal('type_text'),
    text: z.string(),
  }),
]);
export type OperatorInput = z.infer<typeof OperatorInput>;
