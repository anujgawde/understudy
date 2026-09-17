import type { Locator, LocatorLadder, Observation, ObservedElement } from '@understudy/schemas';
import type { DistilledStep } from './distill.js';

const plainIdentifier = /^[A-Za-z][\w-]*$/;

// Discovery targets elements through the ephemeral handle the surface stamps on
// during observe. That handle is renumbered on every observation, so it can
// never reach the artifact — this maps it back to the element it named.
function actedElement(step: DistilledStep): ObservedElement | null {
  if (step.action.actionType === 'navigate') return null;

  const rung = step.action.target[0];
  if (rung?.strategy !== 'css') return null;

  return (
    step.observationBefore.elements.find(
      (element) => rung.selector === `[data-understudy-ref="${element.elementRef}"]`,
    ) ?? null
  );
}

function positionAmongSameRole(element: ObservedElement, observation: Observation): number {
  return observation.elements
    .filter((other) => other.role === element.role)
    .findIndex((other) => other.elementRef === element.elementRef);
}

/**
 * Propose a locator ladder for the element a step acted on, ordered most
 * durable first, deduped and capped at the three rungs the schema allows.
 * Returns null for navigate steps, which address a URL rather than an element.
 */
export function deriveLadder(step: DistilledStep): LocatorLadder | null {
  const element = actedElement(step);
  if (element === null) return null;

  const candidates: Locator[] = [];

  if (element.testId) {
    candidates.push({ strategy: 'css', selector: `[data-testid="${element.testId}"]` });
  }

  if (element.accessibleName) {
    candidates.push({
      strategy: 'role',
      role: element.role,
      accessibleName: element.accessibleName,
    });
    if (element.role === 'link' || element.role === 'button') {
      candidates.push({ strategy: 'text', text: element.accessibleName, matchExactly: true });
    }
  } else if (element.nearbyText?.[0]) {
    // No accessible name means the page labelled this control with a bare cell
    // rather than a <label for>; walk from that cell to the control instead.
    candidates.push({
      strategy: 'adjacent',
      labelText: element.nearbyText[0],
      direction: 'next',
      targetRole: element.role,
    });
  }

  if (element.domId) {
    candidates.push({
      strategy: 'css',
      selector: plainIdentifier.test(element.domId)
        ? `#${element.domId}`
        : `[id="${element.domId}"]`,
    });
  }

  // Always last, and always present: generated ids and labels can both be
  // absent, but position among same-role elements never is.
  candidates.push({
    strategy: 'role',
    role: element.role,
    matchIndex: positionAmongSameRole(element, step.observationBefore),
  });

  const seen = new Set<string>();
  const ladder: Locator[] = [];
  for (const candidate of candidates) {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    ladder.push(candidate);
    if (ladder.length === 3) break;
  }

  return ladder;
}
