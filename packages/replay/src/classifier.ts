import type { BusinessOutcomeRule, FailureCode, Outcome } from '@understudy/schemas';
import type { TerminalState } from './types.js';

/**
 * A failed checkpoint says the expected result is missing. It never says why.
 * An empty result set, a rejected input, an expired session and a 500 all reach
 * this function through the same failed assertion, so the order these checks run
 * in *is* the outcome contract — and running the business rules first, as this
 * did originally, made every one of those a "no such member".
 *
 * Two things keep them apart. Codes in this set describe the run, not the
 * answer, so they can never be reported as a business outcome however the page
 * reads. And a rule reaches this function only once replay has confirmed the
 * page positively shows that rule's signal, which is what stops a validation
 * error from matching a not-found rule that happens to guard the same checkpoint.
 */
const NEVER_A_BUSINESS_OUTCOME: ReadonlySet<FailureCode> = new Set([
  'session_expired',
  'app_error',
  'unexpected_dialog',
  'approval_required',
  'policy_denied',
]);

export function classify(
  state: TerminalState,
  // Rules whose condition matched *and* whose signal replay found on the page.
  // Confirming the signal needs the live page, so it happens in the executor and
  // this stays a pure function over what was established there.
  applicableRules: BusinessOutcomeRule[],
): Outcome {
  if (state.completedAllSteps) {
    if (state.recoveredFrom) {
      return {
        classification: 'recovered',
        recoveredFrom: state.recoveredFrom,
        attempts: state.attempts ?? 2,
        recoveries: state.recoveries ?? [],
        outputs: state.outputs,
      };
    }
    return { classification: 'success', outputs: state.outputs };
  }

  const infrastructural =
    state.failureCode !== undefined && NEVER_A_BUSINESS_OUTCOME.has(state.failureCode);

  if (!infrastructural) {
    const rule = applicableRules[0];
    if (rule) {
      return {
        classification: 'business_outcome',
        code: rule.code,
        message: rule.message,
      };
    }
  }

  return {
    classification: 'failed',
    failureCode: state.failureCode!,
    message: state.failureMessage ?? `Step "${state.failedAtStepId}" failed`,
    failedAtStepId: state.failedAtStepId,
    interventionRaised: false,
  };
}

/**
 * Whether a rule's *condition* fired. Separate from its signal, which only the
 * live page can answer — the executor checks that half and passes the survivors
 * to `classify`.
 */
export function conditionMatches(rule: BusinessOutcomeRule, state: TerminalState): boolean {
  switch (rule.condition.when) {
    case 'step_failed':
      return (
        state.failedAtStepId === rule.condition.stepId &&
        state.failureCode === rule.condition.failureCode
      );
    case 'checkpoint_failed':
      return state.failedCheckpointId === rule.condition.checkpointId;
  }
}
