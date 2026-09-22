import { describe, test, expect } from 'vitest';
import type { Capability, Observation, Policy, RunLog } from '@understudy/schemas';
import { Capability as CapabilitySchema, RunLog as RunLogSchema } from '@understudy/schemas';
import { redactCapability, redactRunLog, redactText, isSensitiveField } from '../src/redact.js';

const policy: Policy = {
  policyId: 'test-policy',
  name: 'Test Policy',
  allowedOrigins: ['http://localhost:3000'],
  rules: [{ actionClass: 'mutate', decision: 'allow' }],
  redactedFieldNames: ['password', 'card number', 'date of birth'],
  irreversibleControlLabels: ['post', 'transfer', 'confirm'],
  redactedPatterns: ['\\b\\d{3}-\\d{2}-\\d{4}\\b'],
  maxStepsPerRun: 30,
  allowedPathPrefixes: [],
  maxRunSeconds: 600,
};

function refSelector(elementRef: string) {
  return [{ strategy: 'css' as const, selector: `[data-understudy-ref="${elementRef}"]` }];
}

function observationWith(
  elements: Observation['elements'],
  url = 'http://localhost:3000/login',
): Observation {
  return { url, pageTitle: 'Login', elements, capturedAt: '2026-09-17T00:00:00.000Z' };
}

function runLogWith(entries: RunLog['entries'], inputs: RunLog['inputs'] = {}): RunLog {
  return {
    runId: 'run-1',
    mode: 'discovery',
    goal: 'sign in',
    inputs,
    startedAt: '2026-09-17T00:00:00.000Z',
    entries,
  };
}

describe('redactRunLog', () => {
  test('a value typed into a sensitive field never reaches the written log', () => {
    const runLog = runLogWith([
      {
        entryType: 'observation',
        sequence: 0,
        occurredAt: '2026-09-17T00:00:00.000Z',
        actor: 'system',
        observation: observationWith([
          {
            elementRef: 'e1',
            role: 'textbox',
            accessibleName: 'Password',
            isEnabled: true,
            isVisible: true,
          },
        ]),
      },
      {
        entryType: 'action',
        sequence: 1,
        occurredAt: '2026-09-17T00:00:01.000Z',
        actor: 'model',
        action: { actionType: 'fill', target: refSelector('e1'), value: 'correct-horse' },
        succeeded: true,
      },
    ]);

    const redacted = redactRunLog(runLog, policy);

    expect(JSON.stringify(redacted)).not.toContain('correct-horse');
    const action = redacted.entries[1];
    expect(action?.entryType === 'action' && action.action.actionType === 'fill').toBe(true);
    expect(JSON.stringify(redacted)).toContain('[redacted]');
  });

  test('a credential that leaked sideways is masked everywhere it appears', () => {
    const runLog = runLogWith([
      {
        entryType: 'observation',
        sequence: 0,
        occurredAt: '2026-09-17T00:00:00.000Z',
        actor: 'system',
        observation: observationWith([
          {
            elementRef: 'e1',
            role: 'textbox',
            domId: 'password',
            currentValue: 'correct-horse',
            isEnabled: true,
            isVisible: true,
          },
        ]),
      },
      {
        entryType: 'rationale',
        sequence: 1,
        occurredAt: '2026-09-17T00:00:01.000Z',
        actor: 'model',
        text: 'I typed correct-horse into the password box.',
      },
      {
        entryType: 'observation',
        sequence: 2,
        occurredAt: '2026-09-17T00:00:02.000Z',
        actor: 'system',
        observation: observationWith(
          [],
          'http://localhost:3000/login?pw=correct-horse',
        ),
      },
    ]);

    const serialised = JSON.stringify(redactRunLog(runLog, policy));

    expect(serialised).not.toContain('correct-horse');
    expect(serialised).toContain('I typed [redacted] into the password box.');
  });

  test('a value handed in under a sensitive input name is masked', () => {
    const runLog = runLogWith(
      [
        {
          entryType: 'extraction',
          sequence: 0,
          occurredAt: '2026-09-17T00:00:00.000Z',
          actor: 'model',
          outputName: 'confirmation',
          rawValue: 'We charged 4111111111111111',
          coerced: false,
        },
      ],
      { cardNumber: '4111111111111111' },
    );

    expect(JSON.stringify(redactRunLog(runLog, policy))).not.toContain('4111111111111111');
  });

  test('PII matching a redacted pattern is masked without being named in advance', () => {
    const runLog = runLogWith([
      {
        entryType: 'extraction',
        sequence: 0,
        occurredAt: '2026-09-17T00:00:00.000Z',
        actor: 'model',
        outputName: 'memberRecord',
        rawValue: 'Member: Jordan Lee, 123-45-6789',
        coerced: false,
      },
    ]);

    const redacted = redactRunLog(runLog, policy);
    const entry = redacted.entries[0];

    expect(entry?.entryType === 'extraction' && entry.rawValue).toBe('Member: Jordan Lee, [redacted]');
  });

  test('an ordinary value is left alone and the result still parses', () => {
    const runLog = runLogWith([
      {
        entryType: 'observation',
        sequence: 0,
        occurredAt: '2026-09-17T00:00:00.000Z',
        actor: 'system',
        observation: observationWith([
          {
            elementRef: 'e1',
            role: 'textbox',
            accessibleName: 'Full name',
            currentValue: 'Jordan Lee',
            isEnabled: true,
            isVisible: true,
          },
        ]),
      },
    ]);

    const redacted = redactRunLog(runLog, policy);

    expect(JSON.stringify(redacted)).toContain('Jordan Lee');
    expect(() => RunLogSchema.parse(redacted)).not.toThrow();
  });

  test('a one-character value is too short to mask, so the log survives', () => {
    const runLog = runLogWith(
      [
        {
          entryType: 'rationale',
          sequence: 0,
          occurredAt: '2026-09-17T00:00:00.000Z',
          actor: 'model',
          text: 'Opening the account page.',
        },
      ],
      { password: 'a' },
    );

    const redacted = redactRunLog(runLog, policy);
    const entry = redacted.entries[0];

    expect(entry?.entryType === 'rationale' && entry.text).toBe('Opening the account page.');
  });
});

describe('isSensitiveField', () => {
  test('matches on any name the page hangs on the control', () => {
    const named = { elementRef: 'e1', role: 'textbox', isEnabled: true, isVisible: true };

    expect(isSensitiveField(policy, { ...named, accessibleName: 'Password' })).toBe(true);
    expect(isSensitiveField(policy, { ...named, domId: 'user-password' })).toBe(true);
    expect(isSensitiveField(policy, { ...named, nearbyText: ['Card number'] })).toBe(true);
    expect(isSensitiveField(policy, { ...named, accessibleName: 'Full name' })).toBe(false);
  });
});

describe('redactCapability', () => {
  function capabilityWith(steps: Capability['steps']): Capability {
    return {
      capabilityId: 'sign-in',
      name: 'Sign in',
      version: 1,
      goal: 'sign in',
      status: 'draft',
      inputs: [],
      outputs: [],
      steps,
      checkpoints: [],
      extractions: [],
      businessOutcomes: [],
      expectedDialogs: [],
      interstitials: [],
    };
  }

  test('a literal typed into a sensitive field does not survive into the artifact', () => {
    const capability = capabilityWith([
      {
        stepId: 'fill-password',
        risk: 'reversible',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'role', role: 'textbox', accessibleName: 'Password' }],
          value: 'correct-horse',
        },
      },
    ]);

    const redacted = redactCapability(capability, policy);

    expect(JSON.stringify(redacted)).not.toContain('correct-horse');
    expect(() => CapabilitySchema.parse(redacted)).not.toThrow();
  });

  test('a value already held by reference is left as the reference', () => {
    const capability = capabilityWith([
      {
        stepId: 'fill-password',
        risk: 'reversible',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'role', role: 'textbox', accessibleName: 'Password' }],
          value: '{{password}}',
        },
      },
    ]);

    const step = redactCapability(capability, policy).steps[0];

    expect(step?.action.actionType === 'fill' && step.action.value).toBe('{{password}}');
  });
});

describe('redactText', () => {
  test('masks a pattern match in a line printed while the run is still going', () => {
    expect(redactText('SSN 123-45-6789 on file', policy)).toBe('SSN [redacted] on file');
  });
});
