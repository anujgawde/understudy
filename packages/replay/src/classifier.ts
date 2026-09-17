import type { BusinessOutcomeRule, FailureCode, Outcome } from '@understudy/schemas';

export interface TerminalState {
  completedAllSteps: boolean;
  failedAtStepId?: string;
  failureCode?: FailureCode;
  failureMessage?: string;
  failedCheckpointId?: string;
  outputs: Record<string, unknown>;
}

function matchesRule(rule: BusinessOutcomeRule, state: TerminalState): boolean {
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

export function classify(
  state: TerminalState,
  businessOutcomes: BusinessOutcomeRule[],
): Outcome {
  if (state.completedAllSteps) {
    return { classification: 'success', outputs: state.outputs };
  }

  for (const rule of businessOutcomes) {
    if (matchesRule(rule, state)) {
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
