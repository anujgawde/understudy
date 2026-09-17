import { z } from 'zod';

export const ObservedElement = z.object({
  // Handle the surface hands back so a later action can act on this exact
  // element without re-running a locator against a page that may have moved on.
  elementRef: z.string().min(1),
  role: z.string().min(1),
  accessibleName: z.string().optional(),
  currentValue: z.string().optional(),
  isEnabled: z.boolean(),
  isVisible: z.boolean(),
  tagName: z.string().optional(),
  domId: z.string().optional(),
  testId: z.string().optional(),
  nearbyText: z.array(z.string()).optional(),
});
export type ObservedElement = z.infer<typeof ObservedElement>;

export const Observation = z.object({
  url: z.url(),
  pageTitle: z.string(),
  elements: z.array(ObservedElement),
  screenshotPath: z.string().min(1).optional(),
  capturedAt: z.iso.datetime(),
});
export type Observation = z.infer<typeof Observation>;
