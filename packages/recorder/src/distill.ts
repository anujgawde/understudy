import type { Action, Observation, RunLog } from '@understudy/schemas';

export interface DistilledStep {
  // Sequence of the originating run log entry, so a proposed step stays
  // traceable back to the moment of the run that produced it.
  sequence: number;
  action: Action;
  observationBefore: Observation;
  // null for navigate steps, which address a URL rather than an element.
  elementRef: string | null;
}

// Discovery targets elements through the ephemeral handle the surface stamps on
// during observe. That handle is renumbered on every observation, so it can
// never reach the artifact — this reads back the element it named.
export function actedElementRef(action: Action, observation: Observation): string | null {
  if (action.actionType === 'navigate') return null;

  const rung = action.target[0];
  if (rung?.strategy !== 'css') return null;

  return (
    observation.elements.find(
      (element) => rung.selector === `[data-understudy-ref="${element.elementRef}"]`,
    )?.elementRef ?? null
  );
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

    steps.push({
      sequence: entry.sequence,
      action,
      observationBefore,
      elementRef: actedElementRef(action, observationBefore),
    });
  }

  return steps;
}
