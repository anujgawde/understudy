import type {
  Action,
  Assertion,
  BusinessOutcomeRule,
  Capability,
  Checkpoint,
  Recovery,
  RunLog,
  RunLogEntry,
  ValueType,
} from '@understudy/schemas';
import type { Surface } from '@understudy/surface';
import type { Intervention } from '@understudy/session';
import { raiseIntervention, shouldEscalate } from '@understudy/session';
import { classify, conditionMatches } from './classifier.js';
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

/**
 * An assertion result carries what the page actually showed, not just whether
 * it agreed. "Expected X to be present" leaves whoever is debugging to go and
 * find out what was there instead; the brief asks the result to say what step,
 * what was expected, and what was observed, and the third one is the only part
 * that shortens the investigation.
 */
async function evaluateAssertion(
  assertion: Assertion,
  surface: Surface,
): Promise<{ passed: boolean; observed: string }> {
  const url = await surface.pageUrl().catch(() => 'an unknown page');

  switch (assertion.assert) {
    case 'text_present': {
      const passed = await surface.hasText(assertion.text);
      return {
        passed,
        observed: passed ? `found on ${url}` : `not present anywhere on ${url}`,
      };
    }
    case 'text_absent': {
      const present = await surface.hasText(assertion.text);
      return {
        passed: !present,
        observed: present ? `still present on ${url}` : `absent from ${url}`,
      };
    }
    case 'element_present': {
      try {
        const { rungIndex, rung, matchCount } = await surface.resolve(assertion.target);
        return {
          passed: true,
          observed: `matched ${matchCount} element(s) on rung ${rungIndex} (${rung.strategy})`,
        };
      } catch {
        const tried = assertion.target.map((rung) => rung.strategy).join(', ');
        return { passed: false, observed: `no element matched any rung (tried: ${tried}) on ${url}` };
      }
    }
    case 'url_matches': {
      const passed = new RegExp(assertion.pattern).test(url);
      return { passed, observed: `url was ${url}` };
    }
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
): Promise<{ passed: boolean; failedAssertion?: Assertion; observed?: string }> {
  for (const assertion of checkpoint.allOf) {
    const result = await evaluateAssertion(assertion, surface);
    if (!result.passed) {
      return { passed: false, failedAssertion: assertion, observed: result.observed };
    }
  }
  return { passed: true };
}

/**
 * Clears any declared notice currently sitting over the flow and reports what it
 * cleared. Only interstitials the capability declares are touched: dismissing an
 * unknown overlay would mean clicking a control nobody recorded, on a page whose
 * state replay cannot account for.
 *
 * Each one is checked against its own `when` signal first, so the dismiss
 * control is only hunted for when the notice is actually showing.
 */
async function dismissInterstitials(
  capability: Capability,
  surface: Surface,
  approveIrreversible: boolean,
): Promise<string[]> {
  const dismissed: string[] = [];

  for (const interstitial of capability.interstitials ?? []) {
    if (interstitial.risk === 'irreversible' && !approveIrreversible) continue;
    if (!(await evaluateAssertion(interstitial.when, surface)).passed) continue;

    try {
      await surface.act({ actionType: 'click', target: interstitial.dismiss });
      dismissed.push(interstitial.name);
    } catch {
      // The notice is showing but its dismiss control is not where the artifact
      // says. That is a locator problem, and leaving the checkpoint to fail
      // reports it as one rather than hiding it behind a recovery.
    }
  }

  return dismissed;
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
        reason: `checkpoint "${checkpoint.checkpointId}" no longer holds: ${describeAssertion(result.failedAssertion!)}, but ${result.observed}`,
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

  const recoveries: Recovery[] = [];
  const terminal: TerminalState = { completedAllSteps: true, outputs: {}, recoveries };

  // Anything left over belongs to whatever ran before this. A run is answerable
  // for the dialogs it raised and the responses it provoked, not for ones it
  // inherited from the run before it on the same surface.
  await surface.drainDialogs();
  surface.clearResponseStatus();
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
    // Checked before the locator is even resolved. An irreversible step is one
    // whose effect cannot be taken back, so the only safe default is to stop in
    // front of it and ask — the alternative is finding out afterwards.
    if (step.risk === 'irreversible' && !options.approveIrreversible) {
      terminal.completedAllSteps = false;
      terminal.failedAtStepId = step.stepId;
      terminal.failureCode = 'approval_required';
      terminal.failureMessage = `Step "${step.stepId}" is marked irreversible and needs approval before it runs`;
      break;
    }

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

      // The step did not fail on its own terms — the server did, and the wait
      // for content that was never going to render is what actually timed out.
      // Reporting that as a missing locator would send someone looking at the
      // artifact for a fault that is nothing to do with it.
      const statusAfterFailure = surface.lastResponseStatus();
      if (statusAfterFailure !== undefined && statusAfterFailure >= 500) {
        terminal.failureCode = 'app_error';
        terminal.failureMessage = `Step "${step.stepId}": the application returned HTTP ${statusAfterFailure}`;
      } else {
        terminal.failureCode =
          action.actionType === 'navigate' ? 'navigation_failed' : 'locator_not_found';
        terminal.failureMessage = `Step "${step.stepId}": ${error instanceof Error ? error.message : String(error)}`;
      }
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

    // Dismissed as they arrived, so the page is already unblocked; what is left
    // is deciding whether this flow is allowed to have raised one. A dialog the
    // capability never declared means replay is somewhere its recording did not
    // go, and proceeding would be the blind step the brief warns about.
    const dialogs = await surface.drainDialogs();

    for (const dialog of dialogs) {
      const expected = capability.expectedDialogs.some((declared) =>
        dialog.message.includes(declared),
      );

      await record({
        entryType: 'dialog',
        sequence: sequence++,
        occurredAt: new Date().toISOString(),
        actor: 'system',
        kind: dialog.kind,
        message: dialog.message,
        expected,
      });

      if (!expected) {
        terminal.completedAllSteps = false;
        terminal.failedAtStepId = step.stepId;
        terminal.failureCode = 'unexpected_dialog';
        terminal.failureMessage = `Step "${step.stepId}" raised an undeclared ${dialog.kind} dialog: "${dialog.message}"`;
      }
    }

    if (!terminal.completedAllSteps) break;

    // The one runtime error that renders perfectly well. An app error page can
    // satisfy every text assertion a checkpoint makes, so the status is what
    // separates "the server broke" from "the answer was negative".
    const status = surface.lastResponseStatus();
    if (status !== undefined && status >= 500) {
      terminal.completedAllSteps = false;
      terminal.failedAtStepId = step.stepId;
      terminal.failureCode = 'app_error';
      terminal.failureMessage = `Step "${step.stepId}": the application returned HTTP ${status}`;
      break;
    }

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

      // Two different recoverable conditions, tried cheapest first. A notice
      // sitting over the result is cleared and the checkpoint re-read at once;
      // only if that was not it does the run pay for the wait.
      if (!result.passed) {
        const dismissed = await dismissInterstitials(
          capability,
          surface,
          options.approveIrreversible ?? false,
        );

        for (const name of dismissed) {
          const recovery = {
            kind: 'dismissed_interstitial' as const,
            atStepId: step.stepId,
            detail: `dismissed the "${name}" interstitial`,
          };
          recoveries.push(recovery);
          await record({
            entryType: 'recovery',
            sequence: sequence++,
            occurredAt: new Date().toISOString(),
            actor: 'system',
            recovery,
          });
        }

        if (dismissed.length > 0) {
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
            terminal.attempts = (terminal.attempts ?? 1) + 1;
          }
        }
      }

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
          const recovery = {
            kind: 'retried_read' as const,
            atStepId: step.stepId,
            detail: `checkpoint "${checkpoint.checkpointId}" passed on a second read after ${RECOVERY_DELAY_MILLISECONDS}ms`,
          };
          recoveries.push(recovery);
          await record({
            entryType: 'recovery',
            sequence: sequence++,
            occurredAt: new Date().toISOString(),
            actor: 'system',
            recovery,
          });

          terminal.recoveredFrom = 'assertion_failed';
          terminal.attempts = (terminal.attempts ?? 1) + 1;
        }
      }

      if (!result.passed) {
        const failedDescription = describeAssertion(result.failedAssertion!);
        terminal.completedAllSteps = false;
        terminal.failedAtStepId = step.stepId;
        terminal.failureCode = 'assertion_failed';
        terminal.failureMessage = `Checkpoint "${checkpoint.checkpointId}" failed: ${failedDescription}, but ${result.observed}`;
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

          const recovery = {
            kind: 'retried_read' as const,
            detail: `extraction "${extraction.outputName}" resolved on a second read after ${RECOVERY_DELAY_MILLISECONDS}ms`,
          };
          recoveries.push(recovery);
          await record({
            entryType: 'recovery',
            sequence: sequence++,
            occurredAt: new Date().toISOString(),
            actor: 'system',
            recovery,
          });

          terminal.recoveredFrom = 'extraction_failed';
          terminal.attempts = (terminal.attempts ?? 1) + 1;
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

  // A rule earns its outcome only if the page backs it up. The condition says
  // which checkpoint failed; the signal says the page is actually showing the
  // situation the rule names. Both halves are recorded, so a rule that matched
  // on structure and was refused on evidence is visible in the log rather than
  // being the invisible reason the caller got a different answer.
  const applicableRules: BusinessOutcomeRule[] = [];

  if (!terminal.completedAllSteps) {
    for (const rule of capability.businessOutcomes ?? []) {
      if (!conditionMatches(rule, terminal)) continue;

      const { passed: signalPresent } = await evaluateAssertion(rule.signal, surface);

      await record({
        entryType: 'outcome_rule',
        sequence: sequence++,
        occurredAt: new Date().toISOString(),
        actor: 'system',
        code: rule.code,
        signalPresent,
      });

      if (signalPresent) applicableRules.push(rule);
    }
  }

  const outcome = classify(terminal, applicableRules);

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
      screenshotPath: await options.captureFailureFrame?.().catch(() => undefined),
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
