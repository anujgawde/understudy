export type ValueType = 'string' | 'number' | 'boolean' | 'date';

export type Locator =
  | { strategy: 'role'; role: string; accessibleName?: string; matchIndex?: number }
  | { strategy: 'text'; text: string; matchExactly?: boolean; matchIndex?: number }
  | {
      strategy: 'adjacent';
      labelText: string;
      direction: 'next' | 'below';
      targetRole?: string;
      matchIndex?: number;
    }
  | { strategy: 'css'; selector: string; matchIndex?: number };

export type LocatorLadder = Locator[];

export type WaitCondition =
  | { waitUntil: 'pageLoad' }
  | { waitUntil: 'selectorPresent'; selector: string }
  | { waitUntil: 'textPresent'; text: string }
  | { waitUntil: 'fixedDelay'; milliseconds: number };

export type Action =
  | { actionType: 'navigate'; url: string }
  | { actionType: 'click'; target: LocatorLadder }
  | { actionType: 'fill'; target: LocatorLadder; value: string };

export type Assertion =
  | { assert: 'text_present'; text: string }
  | { assert: 'text_absent'; text: string }
  | { assert: 'element_present'; target: LocatorLadder }
  | { assert: 'url_matches'; pattern: string };

export type FailureCode =
  | 'locator_not_found'
  | 'assertion_failed'
  | 'extraction_failed'
  | 'type_coercion_failed'
  | 'navigation_failed'
  | 'session_expired'
  | 'policy_denied'
  | 'timeout'
  | 'step_budget_exhausted';

export interface CapabilityField {
  name: string;
  valueType: ValueType;
  required: boolean;
  description?: string;
  secret?: boolean;
}

export interface Step {
  stepId: string;
  action: Action;
  waitFor?: WaitCondition;
  description?: string;
}

export interface Checkpoint {
  checkpointId: string;
  afterStepId: string;
  allOf: Assertion[];
}

export interface BusinessOutcomeRule {
  code: string;
  message: string;
  condition:
    | { when: 'step_failed'; stepId: string; failureCode: FailureCode }
    | { when: 'checkpoint_failed'; checkpointId: string };
}

export interface Capability {
  capabilityId: string;
  name: string;
  version: number;
  goal: string;
  status: 'draft' | 'approved';
  inputs: CapabilityField[];
  outputs: CapabilityField[];
  steps: Step[];
  checkpoints: Checkpoint[];
  extractions: Array<{ outputName: string; target: LocatorLadder; valueType: ValueType }>;
  businessOutcomes: BusinessOutcomeRule[];
  provenance?: {
    discoveredByModel: string;
    discoveryRunId: string;
    discoveredAt: string;
  };
  // Set when a tenant skin overrides steps of the base artifact. Rendered as a
  // micro-badge on the catalog row.
  tenantOverride?: boolean;
  irreversible?: boolean;
}

export type Outcome =
  | { classification: 'success'; outputs: Record<string, unknown> }
  | { classification: 'business_outcome'; code: string; message: string }
  | {
      classification: 'recovered';
      recoveredFrom: FailureCode;
      attempts: number;
      outputs: Record<string, unknown>;
    }
  | {
      classification: 'failed';
      failureCode: FailureCode;
      message: string;
      failedAtStepId?: string;
      interventionRaised: boolean;
    };

export type OutcomeClassification = Outcome['classification'];

// One executed step as the replay screen reads it: what ran, which rung of the
// locator ladder resolved, and how long it took.
export interface TimelineStep {
  stepId: string;
  title: string;
  detail: string;
  durationMs?: number;
  state: 'passed' | 'degraded' | 'failed' | 'not_reached';
  resolvedByIndex?: number;
}

export interface RunLog {
  runId: string;
  mode: 'discovery' | 'replay';
  capabilityId: string;
  capabilityVersion: number;
  artifactSha: string;
  tenant: string;
  caller: string;
  inputs: Record<string, string>;
  startedAt: string;
  completedAt?: string;
  modelCalls: number;
  timeline: TimelineStep[];
  outcome?: Outcome;
  interventionId?: string;
  evidencePath?: string;
  // Only carried by a failed run — the assertion that did not hold.
  failureEvidence?: {
    atStepId: string;
    expected: string;
    observed: string;
  };
}
