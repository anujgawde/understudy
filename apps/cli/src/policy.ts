import type { Policy } from '@understudy/schemas';

/**
 * The policy a CLI run gets when none is supplied: navigation confined to the
 * origin the operator pointed at, and the field names and shapes that must
 * never reach a log or an artifact.
 */
export function defaultPolicy(startUrl: string, maxStepsPerRun: number): Policy {
  return {
    policyId: 'cli-default',
    name: 'CLI default policy',
    allowedOrigins: [new URL(startUrl).origin],
    // Mutations are allowed rather than confirmed because the CLI has no
    // operator channel to ask on; a run started here is already an operator
    // sitting in front of it. The confirm path is exercised by callers that
    // supply onConfirmAction.
    rules: [
      { actionClass: 'read', decision: 'allow' },
      { actionClass: 'navigate', decision: 'allow' },
      { actionClass: 'mutate', decision: 'allow' },
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
    maxStepsPerRun,
  };
}
