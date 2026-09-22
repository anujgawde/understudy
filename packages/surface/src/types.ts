import type { Action, Locator, LocatorLadder, Observation, WaitCondition } from '@understudy/schemas';

export interface ResolveResult {
  rungIndex: number;
  rung: Locator;
  matchCount: number;
}

export interface CapturedDialog {
  kind: string;
  message: string;
  capturedAt: string;
}

export interface Surface {
  observe(): Promise<Observation>;
  act(action: Action, waitCondition?: WaitCondition): Promise<void>;
  resolve(ladder: LocatorLadder): Promise<ResolveResult>;
  extractText(ladder: LocatorLadder): Promise<{ text: string; resolveResult: ResolveResult }>;
  pageUrl(): Promise<string>;
  hasText(text: string): Promise<boolean>;
  // Native dialogs block the page until something answers them, so they are
  // dismissed as they arrive and collected here. Draining returns what appeared
  // since the last drain and clears the buffer, so each step is judged only on
  // the dialogs it actually raised.
  //
  // Async because the dialog event races the action that triggered it: the
  // implementation flushes the browser's event queue first, so a dialog raised
  // by the step just taken is delivered before this returns rather than landing
  // in the next step's buffer.
  drainDialogs(): Promise<CapturedDialog[]>;
  // The status of the last document response. A 5xx is the one runtime error
  // that no assertion about page content can tell you about reliably, because
  // the error page renders perfectly well.
  lastResponseStatus(): number | undefined;
  // Cleared at the start of a run. Without this a surface reused across runs
  // carries the previous one's status, and a resumed run — which has no opening
  // navigation to refresh it — can be failed for someone else's 500.
  clearResponseStatus(): void;
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
  // Field names whose on-screen values are covered before a screenshot is
  // written. Screenshots are the one evidence artifact redaction at the log
  // boundary never sees, so the masking has to happen at capture time.
  redactedFieldNames?: string[];
}

export interface ScreencastOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}
