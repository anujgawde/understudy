import type { Action, Observation, WaitCondition } from '@understudy/schemas';

export interface Surface {
  observe(): Promise<Observation>;
  act(action: Action, waitCondition?: WaitCondition): Promise<void>;
}
