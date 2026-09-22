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
  | 'unexpected_dialog'
  | 'app_error'
  | 'approval_required'
  | 'policy_denied'
  | 'timeout'
  | 'step_budget_exhausted';

export interface Recovery {
  kind: 'retried_read' | 'dismissed_interstitial';
  atStepId?: string;
  detail: string;
}

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
  risk?: 'reversible' | 'irreversible';
}

export interface Checkpoint {
  checkpointId: string;
  afterStepId: string;
  allOf: Assertion[];
}

export interface BusinessOutcomeRule {
  code: string;
  message: string;
  signal: Assertion;
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
  expectedDialogs?: string[];
  interstitials?: Array<{ name: string; when: Assertion; dismiss: LocatorLadder }>;
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
      recoveries?: Recovery[];
      outputs: Record<string, unknown>;
    }
  | {
      classification: 'failed';
      failureCode: FailureCode;
      message: string;
      failedAtStepId?: string;
      recoveries?: Recovery[];
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

// One turn of the discovery loop, grouping the run log's observation /
// rationale / action / policy_decision entries for a single step into the card
// the trace screen draws.
export interface DiscoveryStep {
  sequence: number;
  actionClass: 'navigate' | 'fill' | 'click' | 'assert' | 'extract' | 'submit';
  observe: string;
  decide: string;
  act: string;
  policy?: { decision: 'allow' | 'confirm' | 'deny'; reason: string };
  tokens?: number;
  durationMs?: number;
  inFlight?: boolean;
}

export interface DiscoveryRun {
  runId: string;
  goal: string;
  target: string;
  tenant: string;
  policyId: string;
  perception: string;
  state: 'running' | 'completed' | 'abandoned';
  stepsTaken: number;
  maxSteps: number;
  tokensUsed: number;
  stopConditions: Array<{ name: string; value: string; escalates?: boolean }>;
  steps: DiscoveryStep[];
}

// A concrete value the run touched, with the role the recorder proposes for it.
// Confidence is a shaping-time signal only — it is deliberately not part of the
// capability schema, since a replayed artifact must not depend on it.
export interface ObservedValue {
  valueId: string;
  value: string;
  source: string;
  proposedRole: 'input' | 'output' | 'constant';
  // What this value is called in the contract once shaped, and the type it
  // carries there — so the preview is derived rather than positional.
  contractName: string;
  contractType: string;
  confidence: number;
  uncertaintyReason?: string;
  alternatives?: Array<'input' | 'output' | 'constant' | 'discard'>;
}

export interface ShapingSession {
  runId: string;
  capabilityName: string;
  autoAcceptThreshold: number;
  thresholdSource: string;
  values: ObservedValue[];
}

export type Actor = 'system' | 'model' | 'operator';

export type SessionState = 'idle' | 'running' | 'paused' | 'handed_off';

export interface LedgerEntry {
  entryId: string;
  occurredAt: string;
  actor: Actor | 'paused';
  summary: string;
}

// Why the run stopped. Each trigger carries different context, so each renders
// a different row emphasis in the inbox.
export type InterventionTrigger = 'undeclared_state' | 'policy_denied' | 'risky_step';

export interface Intervention {
  interventionId: string;
  sessionId: string;
  raisedAt: string;
  severity: 'warning' | 'critical';
  state: 'raised' | 'acknowledged' | 'resolved';
  trigger: InterventionTrigger;
  failureCode: string;
  headline: string;
  message: string;
  badges: string[];
  context: {
    runId: string;
    capabilityId: string;
    capabilityVersion: number;
    stepNumber: number;
    totalSteps: number;
    tenant: string;
    pageUrl: string;
    lastSuccessfulStepId: string;
  };
  // The clock is bounded by the target app's own session lifetime, not by our
  // preference — holding a session open for a human who isn't coming has no value.
  sessionSecondsLeft: number;
  sessionSecondsTotal: number;
  actionLabel: string;
}

export interface TakeoverSession {
  sessionId: string;
  interventionId: string;
  state: SessionState;
  controlHeldBy: Actor;
  operatorName: string;
  browser: string;
  viewport: string;
  transport: string;
  claimedSecondsAgo?: number;
  headline: string;
  detail: string;
  ledger: LedgerEntry[];
  constraints: Array<{ decision: 'allow' | 'deny'; text: string }>;
}

export interface PolicyProfile {
  policyId: string;
  revision: number;
  description: string;
  allowedOrigins: string[];
  deniedRoutes: string[];
  rules: Array<{ actionClass: string; note: string; decision: 'safe' | 'confirm' | 'blocked' }>;
  redactedFieldNames: string[];
  screenshotPolicy: string;
  artifactScrubbing: string;
  evidenceRetention: string;
  riskyActionHandling: string;
  autoAcceptThreshold: number;
  escalateOn: string[];
  interventionSla: string;
  maxStepsPerRun: number;
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
