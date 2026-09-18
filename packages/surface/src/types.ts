import type { Action, Locator, LocatorLadder, Observation, WaitCondition } from '@understudy/schemas';

export interface ResolveResult {
  rungIndex: number;
  rung: Locator;
  matchCount: number;
}

export interface Surface {
  observe(): Promise<Observation>;
  act(action: Action, waitCondition?: WaitCondition): Promise<void>;
  resolve(ladder: LocatorLadder): Promise<ResolveResult>;
  extractText(ladder: LocatorLadder): Promise<{ text: string; resolveResult: ResolveResult }>;
  pageUrl(): Promise<string>;
  hasText(text: string): Promise<boolean>;
}

export interface RawObservedElement {
  elementRef: string;
  role: string;
  accessibleName: string | undefined;
  currentValue: string | undefined;
  isEnabled: boolean;
  isVisible: boolean;
  tagName: string | undefined;
  domId: string | undefined;
  testId: string | undefined;
  nearbyText: string[] | undefined;
}

export interface PlaywrightSurfaceOptions {
  screenshotDirectory?: string;
}

export interface ScreencastOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}
