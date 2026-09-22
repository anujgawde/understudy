import { describe, expect, it } from 'vitest';
import { Outcome, Policy, RunLog } from '../src/index';

describe('Outcome', () => {
  it('parses each of the four classifications', () => {
    expect(Outcome.parse({ classification: 'success', outputs: { savingsBalance: 1284.31 } })).toBeTruthy();
    expect(
      Outcome.parse({
        classification: 'business_outcome',
        code: 'member_not_found',
        message: 'No member matches 99999',
      }),
    ).toBeTruthy();
    expect(
      Outcome.parse({
        classification: 'recovered',
        recoveredFrom: 'navigation_failed',
        attempts: 2,
        outputs: {},
      }),
    ).toBeTruthy();
    expect(
      Outcome.parse({
        classification: 'failed',
        failureCode: 'session_expired',
        message: 'Session timed out before the detail page loaded',
        failedAtStepId: 'open-member-detail',
        recoveries: [],
        interventionRaised: true,
      }),
    ).toBeTruthy();
  });

  it('keeps a not-found result out of the failed class', () => {
    const notFound = Outcome.parse({
      classification: 'business_outcome',
      code: 'member_not_found',
      message: 'No member matches 99999',
    });
    expect(notFound.classification).not.toBe('failed');
  });

  it('rejects an unknown failure code', () => {
    const invalid = {
      classification: 'failed',
      failureCode: 'something_unexpected',
      message: 'boom',
      recoveries: [],
      interventionRaised: false,
    };
    expect(Outcome.safeParse(invalid).success).toBe(false);
  });
});

describe('RunLog', () => {
  it('parses a ledger whose entries carry distinct actors', () => {
    const runLog = RunLog.parse({
      runId: 'run-001',
      mode: 'replay',
      capabilityId: 'lookup-savings-balance',
      inputs: { memberNumber: '12345' },
      startedAt: '2026-09-16T18:00:00.000Z',
      entries: [
        { sequence: 0, occurredAt: '2026-09-16T18:00:01.000Z', actor: 'system', entryType: 'rationale', text: 'starting replay' },
        {
          sequence: 1,
          occurredAt: '2026-09-16T18:00:02.000Z',
          actor: 'system',
          entryType: 'action',
          action: { actionType: 'navigate', url: 'http://localhost:4000/login' },
          stepId: 'open-login',
          resolvedByIndex: 0,
          succeeded: true,
        },
        {
          sequence: 2,
          occurredAt: '2026-09-16T18:00:03.000Z',
          actor: 'operator',
          entryType: 'intervention',
          interventionId: 'intervention-1',
          state: 'handed_off',
        },
      ],
    });
    expect(runLog.entries.map((entry) => entry.actor)).toEqual(['system', 'system', 'operator']);
  });

  it('rejects an entry with an unknown type', () => {
    const invalid = {
      runId: 'run-002',
      mode: 'replay',
      inputs: {},
      startedAt: '2026-09-16T18:00:00.000Z',
      entries: [{ sequence: 0, occurredAt: '2026-09-16T18:00:01.000Z', actor: 'system', entryType: 'daydream' }],
    };
    expect(RunLog.safeParse(invalid).success).toBe(false);
  });
});

describe('Policy', () => {
  it('parses a profile that confirms before mutating', () => {
    const policy = Policy.parse({
      policyId: 'discovery-default',
      name: 'Discovery default',
      allowedOrigins: ['http://localhost:4000'],
      rules: [
        { actionClass: 'read', decision: 'allow' },
        { actionClass: 'navigate', decision: 'allow' },
        { actionClass: 'mutate', decision: 'confirm' },
      ],
      redactedFieldNames: ['password', 'ssn'],
      redactedPatterns: ['\\b\\d{3}-\\d{2}-\\d{4}\\b'],
      maxStepsPerRun: 40,
      allowedPathPrefixes: [],
      maxRunSeconds: 600,
    });
    expect(policy.rules.find((rule) => rule.actionClass === 'mutate')?.decision).toBe('confirm');
  });

  it('rejects a policy with no allowed origins', () => {
    const invalid = {
      policyId: 'empty',
      name: 'Empty',
      allowedOrigins: [],
      rules: [{ actionClass: 'read', decision: 'allow' }],
      redactedFieldNames: [],
      redactedPatterns: [],
      maxStepsPerRun: 10,
      allowedPathPrefixes: [],
      maxRunSeconds: 600,
    };
    expect(Policy.safeParse(invalid).success).toBe(false);
  });
});
