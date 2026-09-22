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

/**
 * What the recorder decided when it turned one run into a reusable artifact,
 * and what the model proposed on top of it. There is no confidence score and no
 * review queue here: a value the run was handed is a parameter by definition,
 * and the rest is a constant of the flow. The judgement worth reviewing is the
 * business outcomes, because those are the one part a model guessed.
 */
export interface ShapedValue {
  name: string;
  valueType: string;
  secret?: boolean;
  description?: string;
}

export interface ShapedOutcome {
  code: string;
  message: string;
  /** What the page must show for this outcome to fire. */
  signal: string;
  /** Which step or checkpoint failing puts this rule in the running. */
  condition: string;
}

export interface ShapingSession {
  runId: string;
  capabilityId: string;
  capabilityName: string;
  status: 'draft' | 'approved';
  inputs: ShapedValue[];
  outputs: ShapedValue[];
  checkpoints: Array<{ checkpointId: string; afterStepId: string; asserts: string[] }>;
  businessOutcomes: ShapedOutcome[];
  evidencePath: string;
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
export interface Intervention {
  interventionId: string;
  sessionId: string;
  raisedAt: string;
  severity: 'warning' | 'critical';
  state: 'raised' | 'acknowledged' | 'resolved';
  failureCode: string;
  message: string;
  context: {
    runId: string;
    capabilityId?: string;
    capabilityVersion?: number;
    // Derived from the capability, so the row can say "step 6 of 8" without
    // the intervention itself carrying a number that could drift from it.
    stepNumber?: number;
    totalSteps?: number;
    failedAtStepId?: string;
    lastSuccessfulStepId?: string;
    pageUrl?: string;
    screenshotPath?: string;
  };
  /** Where the run that raised this is on disk, for links into the evidence. */
  evidencePath: string;
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
  name: string;
  allowedOrigins: string[];
  /** Empty means the whole origin is in scope. */
  allowedPathPrefixes: string[];
  rules: Array<{ actionClass: string; decision: 'allow' | 'confirm' | 'deny' }>;
  redactedFieldNames: string[];
  redactedPatterns: string[];
  irreversibleControlLabels: string[];
  maxStepsPerRun: number;
  maxRunSeconds: number;
  /** Failure codes that raise an intervention, read from the escalation set. */
  escalateOn: string[];
  /** The run this policy was in force for, so the screen is never hypothetical. */
  evidencePath: string;
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
