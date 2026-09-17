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
}
