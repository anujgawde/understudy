import type { Observation } from '@understudy/schemas';

export interface Surface {
  observe(): Promise<Observation>;
}
