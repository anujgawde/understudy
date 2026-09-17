import type {
  Action,
  Assertion,
  Capability,
  Checkpoint,
  RunLog,
  RunLogEntry,
  ValueType,
} from '@understudy/schemas';
import type { Surface } from '@understudy/surface';
import { classify, type TerminalState } from './classifier.js';

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

function coerceValue(
  raw: string,
  valueType: ValueType,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  switch (valueType) {
    case 'string':
      return { ok: true, value: raw };
    case 'number': {
      const cleaned = raw.replace(/[$,]/g, '');
      const parsed = Number(cleaned);
      if (cleaned === '' || Number.isNaN(parsed)) {
        return { ok: false, reason: `cannot coerce "${raw}" to number` };
      }
      return { ok: true, value: parsed };
    }
    case 'boolean': {
      const lower = raw.toLowerCase();
      if (lower === 'true' || lower === 'yes' || lower === '1') return { ok: true, value: true };
      if (lower === 'false' || lower === 'no' || lower === '0') return { ok: true, value: false };
      return { ok: false, reason: `cannot coerce "${raw}" to boolean` };
    }
    case 'date': {
      const timestamp = Date.parse(raw);
      if (Number.isNaN(timestamp)) {
        return { ok: false, reason: `cannot coerce "${raw}" to date` };
      }
      return { ok: true, value: new Date(timestamp).toISOString() };
    }
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

  const terminal: TerminalState = { completedAllSteps: true, outputs: {} };

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
        terminal.completedAllSteps = false;
        terminal.failedAtStepId = step.stepId;
        terminal.failureCode = 'locator_not_found';
        terminal.failureMessage = `Step "${step.stepId}": no rung in the locator ladder matched`;
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
      terminal.completedAllSteps = false;
      terminal.failedAtStepId = step.stepId;
      terminal.failureCode =
        action.actionType === 'navigate' ? 'navigation_failed' : 'locator_not_found';
      terminal.failureMessage = `Step "${step.stepId}": ${error instanceof Error ? error.message : String(error)}`;
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
        terminal.completedAllSteps = false;
        terminal.failedAtStepId = step.stepId;
        terminal.failureCode = 'assertion_failed';
        terminal.failureMessage = `Checkpoint "${checkpoint.checkpointId}" failed: ${failedDescription}`;
        terminal.failedCheckpointId = checkpoint.checkpointId;
        break;
      }
    }

    if (!terminal.completedAllSteps) break;
  }

  if (terminal.completedAllSteps && capability.extractions.length > 0) {
    for (const extraction of capability.extractions) {
      let rawValue: string;
      try {
        const { text } = await surface.extractText(extraction.target);
        rawValue = text;
      } catch {
        entries.push({
          entryType: 'extraction',
          sequence: sequence++,
          occurredAt: new Date().toISOString(),
          actor: 'system',
          outputName: extraction.outputName,
          rawValue: '',
          coerced: false,
        });
        terminal.completedAllSteps = false;
        terminal.failureCode = 'extraction_failed';
        terminal.failureMessage = `Extraction "${extraction.outputName}": no rung in the locator ladder matched`;
        break;
      }

      const coercion = coerceValue(rawValue, extraction.valueType);

      entries.push({
        entryType: 'extraction',
        sequence: sequence++,
        occurredAt: new Date().toISOString(),
        actor: 'system',
        outputName: extraction.outputName,
        rawValue,
        coerced: coercion.ok && extraction.valueType !== 'string',
      });

      if (!coercion.ok) {
        terminal.completedAllSteps = false;
        terminal.failureCode = 'type_coercion_failed';
        terminal.failureMessage = `Extraction "${extraction.outputName}": ${coercion.reason}`;
        break;
      }

      terminal.outputs[extraction.outputName] = coercion.value;
    }
  }

  const outcome = classify(terminal, capability.businessOutcomes ?? []);

  const runLog: RunLog = {
    runId,
    mode: 'replay',
    capabilityId: capability.capabilityId,
    inputs,
    startedAt,
    completedAt: new Date().toISOString(),
    entries,
    outcome,
  };

  return { runLog };
}
