import type { Locator, LocatorLadder, Observation, ObservedElement } from '@understudy/schemas';

const plainIdentifier = /^[A-Za-z][\w-]*$/;

// A table cell's accessible name is its own content — the value being read,
// not a stable handle on where that value sits. Locating one by its name would
// bake today's data into the artifact, so these are located by their label.
const rolesNamedByTheirContent = new Set(['cell', 'columnheader', 'rowheader']);

/**
 * The human-readable label for an element: its own accessible name, unless that
 * name is really the data it holds, in which case the neighbouring cell's text.
 */
export function labelFor(element: ObservedElement | undefined): string | undefined {
  if (!element) return undefined;
  if (rolesNamedByTheirContent.has(element.role)) return element.nearbyText?.[0];
  return element.accessibleName ?? element.nearbyText?.[0];
}

function positionAmongSameRole(element: ObservedElement, observation: Observation): number {
  return observation.elements
    .filter((other) => other.role === element.role)
    .findIndex((other) => other.elementRef === element.elementRef);
}

/**
 * Propose a locator ladder for an observed element, ordered most durable first,
 * deduped and capped at the three rungs the schema allows.
 */
export function deriveLadder(elementRef: string, observation: Observation): LocatorLadder | null {
  const element = observation.elements.find((candidate) => candidate.elementRef === elementRef);
  if (!element) return null;

  const candidates: Locator[] = [];

  if (element.testId) {
    candidates.push({ strategy: 'css', selector: `[data-testid="${element.testId}"]` });
  }

  const namedByItsContent = rolesNamedByTheirContent.has(element.role);

  if (element.accessibleName && !namedByItsContent) {
    candidates.push({
      strategy: 'role',
      role: element.role,
      accessibleName: element.accessibleName,
    });
    if (element.role === 'link' || element.role === 'button') {
      candidates.push({ strategy: 'text', text: element.accessibleName, matchExactly: true });
    }
  } else if (element.nearbyText?.[0]) {
    // Nothing usable of its own: either the page labelled this control with a
    // bare cell rather than a <label for>, or it is a cell whose only name is
    // the data inside it. Walk from the neighbouring label instead.
    candidates.push({
      strategy: 'adjacent',
      labelText: element.nearbyText[0],
      direction: 'next',
      ...(namedByItsContent ? {} : { targetRole: element.role }),
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
    matchIndex: positionAmongSameRole(element, observation),
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
