import type {
  Action,
  Capability,
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
