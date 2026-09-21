import type {
  Capability as SchemaCapability,
  RunLog as SchemaRunLog,
  RunLogEntry as SchemaEntry,
} from '@understudy/schemas';
import type {
  Capability,
  DiscoveryRun,
  DiscoveryStep,
  RunLog,
  TimelineStep,
} from '@/types';

export function adaptCapability(schema: SchemaCapability): Capability {
  return {
    capabilityId: schema.capabilityId,
    name: schema.name,
    version: schema.version,
    goal: schema.goal,
    status: schema.status,
    inputs: schema.inputs.map((input) => ({
      name: input.name,
      valueType: input.valueType,
      required: input.required,
      description: input.description,
      secret: input.secret,
    })),
    outputs: (schema.outputs ?? []).map((output) => ({
      name: output.name,
      valueType: output.valueType,
      required: output.required,
      description: output.description,
    })),
    steps: schema.steps.map((step) => ({
      stepId: step.stepId,
      action: step.action,
      waitFor: step.waitFor,
      description: step.description,
    })),
    checkpoints: schema.checkpoints,
    extractions: schema.extractions,
    businessOutcomes: schema.businessOutcomes ?? [],
    provenance: schema.provenance,
  };
}

function buildTimeline(entries: SchemaEntry[], steps: SchemaCapability['steps']): TimelineStep[] {
  const timeline: TimelineStep[] = [];

  for (const step of steps) {
    const actionEntry = entries.find(
      (entry) => entry.entryType === 'action' && entry.stepId === step.stepId,
    );

    if (!actionEntry || actionEntry.entryType !== 'action') {
      timeline.push({
        stepId: step.stepId,
        title: step.description ?? step.stepId,
        detail: step.action.actionType,
        state: 'not_reached',
      });
      continue;
    }

    const assertionEntries = entries.filter(
      (entry) => entry.entryType === 'assertion',
    );
    const stepCheckpointFailed = assertionEntries.some(
      (entry) => entry.entryType === 'assertion' && !entry.passed,
    );

    let state: TimelineStep['state'] = 'passed';
    if (!actionEntry.succeeded) {
      state = 'failed';
    } else if (stepCheckpointFailed) {
      state = 'degraded';
    }

    timeline.push({
      stepId: step.stepId,
      title: step.description ?? step.stepId,
      detail: step.action.actionType,
      state,
      resolvedByIndex: actionEntry.resolvedByIndex,
    });
  }

  return timeline;
}

export function adaptReplayRunLog(
  schema: SchemaRunLog,
  capability: SchemaCapability | null,
  evidencePath: string,
): RunLog {
  const steps = capability?.steps ?? [];

  return {
    runId: schema.runId,
    mode: schema.mode,
    capabilityId: schema.capabilityId ?? 'unknown',
    capabilityVersion: capability?.version ?? 1,
    artifactSha: 'disk',
    tenant: 'local',
    caller: 'cli',
    inputs: redactSecrets(schema.inputs, capability),
    startedAt: schema.startedAt,
    completedAt: schema.completedAt,
    modelCalls: schema.entries.filter((entry) => entry.entryType === 'rationale').length,
    timeline: buildTimeline(schema.entries, steps),
    outcome: schema.outcome,
    evidencePath,
    failureEvidence: buildFailureEvidence(schema),
  };
}

function redactSecrets(
  inputs: Record<string, string>,
  capability: SchemaCapability | null,
): Record<string, string> {
  if (!capability) return inputs;
  const secretNames = new Set(
    capability.inputs.filter((input) => input.secret).map((input) => input.name),
  );
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(inputs)) {
    redacted[key] = secretNames.has(key) ? '••••••' : value;
  }
  return redacted;
}

function buildFailureEvidence(schema: SchemaRunLog): RunLog['failureEvidence'] {
  if (schema.outcome?.classification !== 'failed') return undefined;

  const failedAssertion = schema.entries.find(
    (entry) => entry.entryType === 'assertion' && !entry.passed,
  );

  if (!failedAssertion || failedAssertion.entryType !== 'assertion') return undefined;

  return {
    atStepId: schema.outcome.failedAtStepId ?? 'unknown',
    expected: `checkpoint ${failedAssertion.checkpointId} to hold`,
    observed: 'assertion failed',
  };
}

export function adaptDiscoveryRunLog(schema: SchemaRunLog): DiscoveryRun {
  const steps = buildDiscoverySteps(schema.entries);
  const actionCount = schema.entries.filter((entry) => entry.entryType === 'action').length;
  const totalTokens = 0;

  return {
    runId: schema.runId,
    goal: schema.goal ?? schema.capabilityId ?? 'unknown',
    target: 'localhost:4000',
    tenant: 'local',
    policyId: 'default',
    perception: 'vision + a11y tree',
    state: schema.outcome ? 'completed' : 'running',
    stepsTaken: actionCount,
    maxSteps: 30,
    tokensUsed: totalTokens,
    stopConditions: [
      { name: 'step budget', value: '30' },
      { name: 'outcome', value: schema.outcome?.classification ?? 'pending' },
    ],
    steps,
  };
}

function buildDiscoverySteps(entries: SchemaEntry[]): DiscoveryStep[] {
  const steps: DiscoveryStep[] = [];
  let currentStep: Partial<DiscoveryStep> = {};
  let sequence = 0;

  for (const entry of entries) {
    switch (entry.entryType) {
      case 'observation':
        if (currentStep.act) {
          steps.push(finalizeStep(currentStep, sequence++));
          currentStep = {};
        }
        currentStep.observe = `${entry.observation.url} — ${entry.observation.elements.length} elements`;
        break;
      case 'rationale':
        currentStep.decide = entry.text;
        break;
      case 'action': {
        const action = entry.action;
        if (action.actionType === 'navigate') {
          currentStep.act = `navigate → ${action.url}`;
          currentStep.actionClass = 'navigate';
        } else if (action.actionType === 'fill') {
          currentStep.act = `fill "${action.value}"`;
          currentStep.actionClass = 'fill';
        } else if (action.actionType === 'click') {
          currentStep.act = `click (${action.target[0]?.strategy ?? 'unknown'} locator)`;
          currentStep.actionClass = 'click';
        }
        break;
      }
      case 'policy_decision':
        currentStep.policy = { decision: entry.decision, reason: entry.reason };
        break;
      case 'extraction':
        if (currentStep.act) {
          steps.push(finalizeStep(currentStep, sequence++));
          currentStep = {};
        }
        currentStep.observe = `extract ${entry.outputName}`;
        currentStep.act = `extracted "${entry.rawValue}"`;
        currentStep.actionClass = 'extract';
        break;
    }
  }

  if (currentStep.act || currentStep.observe) {
    steps.push(finalizeStep(currentStep, sequence));
  }

  return steps;
}

function finalizeStep(partial: Partial<DiscoveryStep>, sequence: number): DiscoveryStep {
  return {
    sequence,
    actionClass: partial.actionClass ?? 'navigate',
    observe: partial.observe ?? '',
    decide: partial.decide ?? '',
    act: partial.act ?? '',
    policy: partial.policy,
  };
}
