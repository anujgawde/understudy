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
import type { Intervention } from '@understudy/session';
import { raiseIntervention, shouldEscalate } from '@understudy/session';
import { classify } from './classifier.js';
import type { ExecutorOptions, ExecutorResult, ReassertResult, TerminalState } from './types.js';

const AUTH_URL_PATTERN = /(^|[/.])(login|log-in|signin|sign-in|auth|sso|session)([/?#]|$)/i;

// Deliberately generic: a password field on screen or an auth-shaped URL are the
// two signals that hold across arbitrary web apps, so no target-specific marker
// is baked in here.
async function looksLikeAuthPage(surface: Surface): Promise<boolean> {
  if (AUTH_URL_PATTERN.test(await surface.pageUrl())) return true;
  try {
    await surface.resolve([{ strategy: 'css', selector: 'input[type="password"]' }]);
    return true;
  } catch {
    return false;
  }
}

// Only a run that had already cleared the auth wall can be said to have lost the
// session; a capability that simply starts on a login page has not.
const AMBIGUOUS_FAILURES = new Set(['locator_not_found', 'assertion_failed', 'extraction_failed']);

// Checkpoints and extractions only read the page, so trying them a second time
// cannot submit anything twice. Clicks and fills get no retry for exactly that
// reason: replay would have no way to know whether the first one took effect.
const RECOVERY_DELAY_MILLISECONDS = 2_000;

function waitBeforeRetry(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, RECOVERY_DELAY_MILLISECONDS));
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

// An operator who took the session over may have navigated anywhere. Before the
// run is allowed to replay into the page they left behind, the checkpoints that
// the previous step established have to still hold.
export async function reassert(
  capability: Capability,
  surface: Surface,
  resumeAtStepId: string,
): Promise<ReassertResult> {
  const resumeIndex = capability.steps.findIndex((step) => step.stepId === resumeAtStepId);
  if (resumeIndex === -1) {
    return { held: false, reason: `step "${resumeAtStepId}" is not part of this capability` };
  }

  const previousStep = capability.steps[resumeIndex - 1];
  if (!previousStep) return { held: true };

  const guarding = capability.checkpoints.filter(
    (checkpoint) => checkpoint.afterStepId === previousStep.stepId,
  );

  for (const checkpoint of guarding) {
    const result = await evaluateCheckpoint(checkpoint, surface);
    if (!result.passed) {
      return {
        held: false,
        reason: `checkpoint "${checkpoint.checkpointId}" no longer holds: ${describeAssertion(result.failedAssertion!)}`,
        checkpointId: checkpoint.checkpointId,
      };
    }
  }

  return { held: true };
}

export async function execute(options: ExecutorOptions): Promise<ExecutorResult> {
  const { capability, surface, inputs } = options;
  const runId = options.runId ?? crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const entries: RunLogEntry[] = [];
  let sequence = 0;

  const record = async (entry: RunLogEntry): Promise<void> => {
    entries.push(entry);
    await options.onEntry?.(entry);
  };

  const terminal: TerminalState = { completedAllSteps: true, outputs: {} };
  let lastSuccessfulStepId: string | undefined;
  let clearedAuth = false;
  let stepsToRun = capability.steps;

  if (options.resumeAtStepId) {
    const gate = await reassert(capability, surface, options.resumeAtStepId);

    if (gate.held) {
      const resumeIndex = capability.steps.findIndex(
        (step) => step.stepId === options.resumeAtStepId,
      );
      stepsToRun = capability.steps.slice(resumeIndex);
      clearedAuth = !(await looksLikeAuthPage(surface));
    } else {
      stepsToRun = [];

      if (gate.checkpointId) {
        await record({
          entryType: 'assertion',
          sequence: sequence++,
          occurredAt: new Date().toISOString(),
          actor: 'system',
          checkpointId: gate.checkpointId,
          passed: false,
        });
      }

      terminal.completedAllSteps = false;
      terminal.failedAtStepId = options.resumeAtStepId;
      terminal.failureCode = 'assertion_failed';
      terminal.failureMessage = `Cannot resume at "${options.resumeAtStepId}": ${gate.reason}`;
    }
  }

  for (const step of stepsToRun) {
    const action = resolveActionInputs(step.action, inputs);
    let resolvedByIndex: number | undefined;

    if (action.actionType === 'click' || action.actionType === 'fill') {
      try {
        const resolveResult = await surface.resolve(action.target);
        resolvedByIndex = resolveResult.rungIndex;
      } catch {
        await record({
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
      await record({
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

    await record({
      entryType: 'action',
      sequence: sequence++,
      occurredAt: new Date().toISOString(),
      actor: 'system',
      action,
      stepId: step.stepId,
      resolvedByIndex,
      succeeded: true,
    });
    lastSuccessfulStepId = step.stepId;

    if (!clearedAuth && !(await looksLikeAuthPage(surface))) clearedAuth = true;

    const stepCheckpoints = capability.checkpoints.filter(
      (checkpoint) => checkpoint.afterStepId === step.stepId,
    );

    for (const checkpoint of stepCheckpoints) {
      let result = await evaluateCheckpoint(checkpoint, surface);

      await record({
        entryType: 'assertion',
        sequence: sequence++,
        occurredAt: new Date().toISOString(),
        actor: 'system',
        checkpointId: checkpoint.checkpointId,
        passed: result.passed,
      });

      if (!result.passed) {
        await waitBeforeRetry();
        result = await evaluateCheckpoint(checkpoint, surface);

        await record({
          entryType: 'assertion',
          sequence: sequence++,
          occurredAt: new Date().toISOString(),
          actor: 'system',
          checkpointId: checkpoint.checkpointId,
          passed: result.passed,
        });

        if (result.passed) {
          terminal.recoveredFrom = 'assertion_failed';
          terminal.attempts = 2;
        }
      }

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
        await waitBeforeRetry();
        try {
          const { text } = await surface.extractText(extraction.target);
          rawValue = text;
          terminal.recoveredFrom = 'extraction_failed';
          terminal.attempts = 2;
        } catch {
          await record({
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
      }

      const coercion = coerceValue(rawValue, extraction.valueType);

      await record({
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

  // A run that was authenticated and is now staring at a login page did not fail
  // to find an element — it lost its session, and saying so is what lets the
  // escalation path report a cause an operator can act on.
  if (
    clearedAuth &&
    terminal.failureCode &&
    AMBIGUOUS_FAILURES.has(terminal.failureCode) &&
    (await looksLikeAuthPage(surface))
  ) {
    terminal.failureCode = 'session_expired';
    terminal.failureMessage = `Session expired before "${terminal.failedAtStepId ?? 'extraction'}" could complete`;
  }

  const outcome = classify(terminal, capability.businessOutcomes ?? []);

  let intervention: Intervention | undefined;

  if (
    options.session &&
    outcome.classification === 'failed' &&
    shouldEscalate(outcome.failureCode)
  ) {
    intervention = raiseIntervention({
      registry: options.session.registry,
      sessionId: options.session.sessionId,
      runId,
      capabilityId: capability.capabilityId,
      failureCode: outcome.failureCode,
      failedAtStepId: terminal.failedAtStepId,
      lastSuccessfulStepId,
      message: outcome.message,
      pageUrl: await surface.pageUrl().catch(() => undefined),
    });

    await record({
      entryType: 'intervention',
      sequence: sequence++,
      occurredAt: new Date().toISOString(),
      actor: 'system',
      interventionId: intervention.interventionId,
      state: 'raised',
    });

    outcome.interventionRaised = true;
  }

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

  return { runLog, intervention };
}
