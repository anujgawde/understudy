import type { Policy } from '@understudy/schemas';

/**
 * The policy a CLI run gets when none is supplied: navigation confined to the
 * origin the operator pointed at, and the field names and shapes that must
 * never reach a log or an artifact.
 *
 * `allowMutations` is the operator saying up front that this run may change
 * things without stopping to ask each time. It is passed explicitly rather than
 * assumed, because the earlier default — allow everything, on the grounds that
 * someone is probably watching — is an allowlist that permits what it was put
 * there to gate.
 */
export function defaultPolicy(
  startUrl: string,
  maxStepsPerRun: number,
  allowMutations = false,
): Policy {
  return {
    policyId: 'cli-default',
    name: 'CLI default policy',
    allowedOrigins: [new URL(startUrl).origin],
    // Empty on purpose: the CLI is pointed at one application and the whole of
    // it is in scope. A tenant policy would narrow this to the routes the task
    // needs, which is the difference between "this app" and "this screen".
    allowedPathPrefixes: [],
    rules: [
      { actionClass: 'read', decision: 'allow' },
      { actionClass: 'navigate', decision: 'allow' },
      { actionClass: 'mutate', decision: allowMutations ? 'allow' : 'confirm' },
    ],
    redactedFieldNames: [
      'password',
      'passcode',
      'secret',
      'token',
      'api key',
      'ssn',
      'social security',
      'card number',
      'cvv',
      'security code',
      'date of birth',
      'dob',
    ],
    redactedPatterns: [
      // Payment card: 13-19 digits, however the page groups them.
      '\\b\\d(?:[ -]?\\d){12,18}\\b',
      // US social security number.
      '\\b\\d{3}-\\d{2}-\\d{4}\\b',
    ],
    // Matched against every name a control carries, so a step that presses one
    // of these is recorded as irreversible and replay stops in front of it. The
    // list is deliberately about committing money or records rather than about
    // the word "submit", which a search button wears just as often.
    irreversibleControlLabels: [
      'post',
      'transfer',
      'confirm',
      'approve',
      'authorize',
      'submit payment',
      'place order',
      'close account',
      'delete',
      'remove',
      'void',
      'reverse',
      'disburse',
      'issue',
    ],
    maxStepsPerRun,
    maxRunSeconds: 600,
  };
}
