import type {
  Capability,
  Locator,
  LocatorLadder,
  ObservedElement,
  Policy,
  RunLog,
} from '@understudy/schemas';

export const REDACTION_PLACEHOLDER = '[redacted]';

// A value of one or two characters occurs everywhere by coincidence, so masking
// every occurrence of it would gut the log rather than clean it.
const shortestMaskableValue = 3;

// "Card number", "cardNumber" and "card_number" are one field written three
// ways, so names are compared on their letters and digits alone. A policy then
// names each field once rather than once per spelling.
function comparableName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveName(policy: Policy, name: string): boolean {
  const compared = comparableName(name);
  return policy.redactedFieldNames.some((fieldName) => {
    const target = comparableName(fieldName);
    return target !== '' && compared.includes(target);
  });
}

/**
 * Whether the page's own naming marks this control as holding something the
 * policy says not to keep. Every name the page hangs on the control is checked,
 * because the one that gives the field away varies: a login form may label the
 * box only through its id, and a member row may carry the PII under the heading
 * beside it rather than in its own accessible name.
 */
export function isSensitiveField(policy: Policy, element: ObservedElement): boolean {
  const names = [
    element.accessibleName,
    element.domId,
    element.testId,
    ...(element.nearbyText ?? []),
  ].filter((name): name is string => name !== undefined);

  return names.some((name) => isSensitiveName(policy, name));
}

// Discovery addresses an element through the ephemeral handle the surface
// stamps on during observe, so this reads that handle back out of the ladder.
function targetsElement(ladder: LocatorLadder, elementRef: string): boolean {
  return ladder.some(
    (rung) => rung.strategy === 'css' && rung.selector === `[data-understudy-ref="${elementRef}"]`,
  );
}

function collect(literals: Set<string>, value: string | undefined): void {
  if (value !== undefined && value.length >= shortestMaskableValue) literals.add(value);
}

/**
 * The literal strings this run treated as sensitive: what was handed in under a
 * sensitive input name, what a sensitive field already held, and what was typed
 * into one. Gathered as values rather than as locations because a credential
 * leaks sideways — into the text beside the box, into a URL, into the
 * rationale the model wrote about what it just did.
 */
function sensitiveLiterals(runLog: RunLog, policy: Policy): Set<string> {
  const literals = new Set<string>();
  const sensitiveRefs = new Set<string>();

  for (const [inputName, value] of Object.entries(runLog.inputs)) {
    if (isSensitiveName(policy, inputName)) collect(literals, value);
  }

  for (const entry of runLog.entries) {
    if (entry.entryType !== 'observation') continue;
    for (const element of entry.observation.elements) {
      if (!isSensitiveField(policy, element)) continue;
      sensitiveRefs.add(element.elementRef);
      collect(literals, element.currentValue);
    }
  }

  for (const entry of runLog.entries) {
    if (entry.entryType !== 'action') continue;
    const action = entry.action;
    if (action.actionType !== 'fill') continue;
    if ([...sensitiveRefs].some((ref) => targetsElement(action.target, ref))) {
      collect(literals, action.value);
    }
  }

  return literals;
}

function compilePatterns(policy: Policy): RegExp[] {
  return policy.redactedPatterns.map((pattern) => new RegExp(pattern, 'g'));
}

function maskString(value: string, literals: Set<string>, patterns: RegExp[]): string {
  let masked = value;
  for (const literal of literals) masked = masked.split(literal).join(REDACTION_PLACEHOLDER);
  for (const pattern of patterns) masked = masked.replace(pattern, REDACTION_PLACEHOLDER);
  return masked;
}

// Structural rather than field-by-field: a redactor that has to be told about
// every new string field is a redactor that misses the next one added.
function maskDeep<T>(value: T, literals: Set<string>, patterns: RegExp[]): T {
  if (typeof value === 'string') return maskString(value, literals, patterns) as T;
  if (Array.isArray(value)) {
    return value.map((item) => maskDeep(item, literals, patterns)) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, maskDeep(nested, literals, patterns)]),
    ) as T;
  }
  return value;
}

/**
 * Mask a single string against the policy's patterns alone. For output that
 * streams — a progress line printed while the run is still going — where the
 * observation naming a field as sensitive may not have happened yet.
 */
export function redactText(text: string, policy: Policy): string {
  return maskString(text, new Set(), compilePatterns(policy));
}

/**
 * Strip credentials and PII from a run log before it is written or printed.
 * The run log is the widest surface in the system — it holds every observation
 * the model saw — so this is the boundary worth scrubbing rather than the
 * individual call sites that build the entries.
 */
export function redactRunLog(runLog: RunLog, policy: Policy): RunLog {
  return maskDeep(runLog, sensitiveLiterals(runLog, policy), compilePatterns(policy));
}

/**
 * The same sweep over a capability artifact. A secret typed during discovery
 * should already be held by reference, so this catches what got in some other
 * way: a value the recorder inlined as a constant of the flow, or PII carried
 * along in an assertion or a description.
 */
export function redactCapability(capability: Capability, policy: Policy): Capability {
  const literals = new Set<string>();

  for (const step of capability.steps) {
    if (step.action.actionType !== 'fill') continue;
    if (/^\{\{.+\}\}$/.test(step.action.value)) continue;
    const names = [step.stepId, step.description, ...(step.action.target.map(describeRung))];
    if (names.some((name) => name !== undefined && isSensitiveName(policy, name))) {
      collect(literals, step.action.value);
    }
  }

  return maskDeep(capability, literals, compilePatterns(policy));
}

function describeRung(rung: Locator): string {
  switch (rung.strategy) {
    case 'css':
      return rung.selector;
    case 'role':
      return rung.accessibleName ?? rung.role;
    case 'text':
      return rung.text;
    case 'adjacent':
      return rung.labelText;
  }
}
