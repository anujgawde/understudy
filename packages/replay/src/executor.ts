import type {
  Action,
  Assertion,
  Capability,
  Checkpoint,
  FailureCode,
  Outcome,
  RunLog,
  RunLogEntry,
} from '@understudy/schemas';
import type { Surface } from '@understudy/surface';

export interface ExecutorOptions {
  capability: Capability;
  surface: Surface;
  inputs: Record<string, string>;
  runId?: string;
}

export interface ExecutorResult {
  runLog: RunLog;
}

function substituteInputs(value: string, inputs: Record<string, string>): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_match, inputName: string) => {
    const resolved = inputs[inputName];
    if (resolved === undefined) {
      throw new Error(`Input "{{${inputName}}}" referenced in action but not supplied`);
    }
    return resolved;
  });
}

function resolveActionInputs(action: Action, inputs: Record<string, string>): Action {
  switch (action.actionType) {
    case 'navigate':
      return { ...action, url: substituteInputs(action.url, inputs) };
    case 'fill':
      return { ...action, value: substituteInputs(action.value, inputs) };
    case 'click':
      return action;
  }
}

function describeAssertion(assertion: Assertion): string {
  switch (assertion.assert) {
    case 'text_present':
      return `expected text "${assertion.text}" to be present`;
    case 'text_absent':
      return `expected text "${assertion.text}" to be absent`;
    case 'element_present':
      return `expected element to be present (${assertion.target[0]!.strategy} locator)`;
    case 'url_matches':
      return `expected URL to match /${assertion.pattern}/`;
  }
}

async function evaluateAssertion(assertion: Assertion, surface: Surface): Promise<boolean> {
  switch (assertion.assert) {
    case 'text_present':
      return surface.hasText(assertion.text);
    case 'text_absent':
      return !(await surface.hasText(assertion.text));
    case 'element_present':
      try {
        await surface.resolve(assertion.target);
        return true;
      } catch {
        return false;
      }
    case 'url_matches':
      return new RegExp(assertion.pattern).test(await surface.pageUrl());
  }
}

async function evaluateCheckpoint(
  checkpoint: Checkpoint,
  surface: Surface,
): Promise<{ passed: boolean; failedAssertion?: Assertion }> {
  for (const assertion of checkpoint.allOf) {
    if (!(await evaluateAssertion(assertion, surface))) {
      return { passed: false, failedAssertion: assertion };
    }
  }
  return { passed: true };
}

export async function execute(options: ExecutorOptions): Promise<ExecutorResult> {
  const { capability, surface, inputs } = options;
  const runId = options.runId ?? crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const entries: RunLogEntry[] = [];
  let sequence = 0;

  let outcome: Outcome | undefined;

  for (const step of capability.steps) {
    const action = resolveActionInputs(step.action, inputs);
    let resolvedByIndex: number | undefined;

    if (action.actionType === 'click' || action.actionType === 'fill') {
      try {
        const resolveResult = await surface.resolve(action.target);
        resolvedByIndex = resolveResult.rungIndex;
      } catch {
        entries.push({
          entryType: 'action',
          sequence: sequence++,
          occurredAt: new Date().toISOString(),
          actor: 'system',
          action,
          stepId: step.stepId,
          resolvedByIndex: undefined,
          succeeded: false,
        });
        outcome = {
          classification: 'failed',
          failureCode: 'locator_not_found',
          message: `Step "${step.stepId}": no rung in the locator ladder matched`,
          failedAtStepId: step.stepId,
          interventionRaised: false,
        };
        break;
      }
    }

    try {
      await surface.act(action, step.waitFor);
    } catch (error) {
      entries.push({
        entryType: 'action',
        sequence: sequence++,
        occurredAt: new Date().toISOString(),
        actor: 'system',
        action,
        stepId: step.stepId,
        resolvedByIndex,
        succeeded: false,
      });

      const failureCode: FailureCode =
        action.actionType === 'navigate' ? 'navigation_failed' : 'locator_not_found';

      outcome = {
        classification: 'failed',
        failureCode,
        message: `Step "${step.stepId}": ${error instanceof Error ? error.message : String(error)}`,
        failedAtStepId: step.stepId,
        interventionRaised: false,
      };
      break;
    }

    entries.push({
      entryType: 'action',
      sequence: sequence++,
      occurredAt: new Date().toISOString(),
      actor: 'system',
      action,
      stepId: step.stepId,
      resolvedByIndex,
      succeeded: true,
    });

    const stepCheckpoints = capability.checkpoints.filter(
      (checkpoint) => checkpoint.afterStepId === step.stepId,
    );

    for (const checkpoint of stepCheckpoints) {
      const result = await evaluateCheckpoint(checkpoint, surface);

      entries.push({
        entryType: 'assertion',
        sequence: sequence++,
        occurredAt: new Date().toISOString(),
        actor: 'system',
        checkpointId: checkpoint.checkpointId,
        passed: result.passed,
      });

      if (!result.passed) {
        const failedDescription = describeAssertion(result.failedAssertion!);
        outcome = {
          classification: 'failed',
          failureCode: 'assertion_failed',
          message: `Checkpoint "${checkpoint.checkpointId}" failed: ${failedDescription}`,
          failedAtStepId: step.stepId,
          interventionRaised: false,
        };
        break;
      }
    }

    if (outcome) break;
  }

  const runLog: RunLog = {
    runId,
    mode: 'replay',
    capabilityId: capability.capabilityId,
    inputs,
    startedAt,
    completedAt: new Date().toISOString(),
    entries,
    outcome: outcome ?? { classification: 'success', outputs: {} },
  };

  return { runLog };
}
