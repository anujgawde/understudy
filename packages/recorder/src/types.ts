import type { Action, Observation, Policy } from '@understudy/schemas';

export interface RecordingOptions {
  capabilityId: string;
  name: string;
  modelId: string;
  // Supplies the field names whose values must never be inlined into the
  // artifact; without it every fill is recorded as an ordinary value.
  policy?: Policy;
}

export interface DistilledStep {
  // Sequence of the originating run log entry, so a proposed step stays
  // traceable back to the moment of the run that produced it.
  sequence: number;
  action: Action;
  observationBefore: Observation;
  // null for navigate steps, which address a URL rather than an element.
  elementRef: string | null;
}
