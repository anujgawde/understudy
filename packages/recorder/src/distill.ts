import type { Action, Observation, RunLog } from '@understudy/schemas';

export interface DistilledStep {
  // Sequence of the originating run log entry, so a proposed step stays
  // traceable back to the moment of the run that produced it.
  sequence: number;
  action: Action;
  observationBefore: Observation;
}

function sameTarget(left: Action, right: Action): boolean {
  if (left.actionType === 'navigate' || right.actionType === 'navigate') return false;
  return JSON.stringify(left.target) === JSON.stringify(right.target);
}

/**
 * Reduce a discovery run log to the ordered actions worth replaying: the
 * successful path, with the model's failed attempts, denied actions, self
 * corrections and post-goal wandering removed.
 */
export function distillTrace(runLog: RunLog): DistilledStep[] {
  if (runLog.outcome?.classification !== 'success') return [];

  const entries = [...runLog.entries].sort((left, right) => left.sequence - right.sequence);

  // Anything the model did after it had pulled the last value it needed did not
  // contribute to reaching the goal.
  const lastExtraction = entries.findLast((entry) => entry.entryType === 'extraction');
  const pathEndsAt = lastExtraction ? lastExtraction.sequence : Number.POSITIVE_INFINITY;

  const steps: DistilledStep[] = [];
  let observationBefore: Observation | null = null;

  for (const entry of entries) {
    if (entry.sequence > pathEndsAt) break;

    if (entry.entryType === 'observation') {
      observationBefore = entry.observation;
      continue;
    }

    if (entry.entryType !== 'action' || !entry.succeeded || observationBefore === null) continue;

    const { action } = entry;

    if (action.actionType === 'navigate' && action.url === observationBefore.url) continue;

    const previous = steps.at(-1);
    if (
      previous &&
      action.actionType === 'fill' &&
      previous.action.actionType === 'fill' &&
      sameTarget(action, previous.action)
    ) {
      steps.pop();
    }

    steps.push({ sequence: entry.sequence, action, observationBefore });
  }

  return steps;
}
