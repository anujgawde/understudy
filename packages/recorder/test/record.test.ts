import { describe, test, expect } from 'vitest';
import {
  Capability,
  type Action,
  type ObservedElement,
  type Policy,
  type RunLog,
  type RunLogEntry,
} from '@understudy/schemas';
import { recordCapability } from '../src/record.js';

const at = '2026-09-17T10:00:00.000Z';

function textbox(elementRef: string, label: string, named: boolean): ObservedElement {
  return {
    elementRef,
    role: 'textbox',
    ...(named ? { accessibleName: label } : { nearbyText: [label] }),
    isEnabled: true,
    isVisible: true,
  };
}

function button(elementRef: string, accessibleName: string): ObservedElement {
  return { elementRef, role: 'button', accessibleName, isEnabled: true, isVisible: true };
}

function cell(elementRef: string, label: string, content: string): ObservedElement {
  return {
    elementRef,
    role: 'cell',
    accessibleName: content,
    nearbyText: [label],
    isEnabled: true,
    isVisible: true,
  };
}

function targeting(elementRef: string) {
  return [{ strategy: 'css' as const, selector: `[data-understudy-ref="${elementRef}"]` }];
}

function observed(
  sequence: number,
  url: string,
  pageTitle: string,
  elements: ObservedElement[],
): RunLogEntry {
  return {
    entryType: 'observation',
    sequence,
    occurredAt: at,
    actor: 'system',
    observation: { url, pageTitle, elements, capturedAt: at },
  };
}

function acted(sequence: number, action: Action): RunLogEntry {
  return { entryType: 'action', sequence, occurredAt: at, actor: 'model', action, succeeded: true };
}

function extracted(sequence: number, elementRef: string, rawValue: string): RunLogEntry {
  return {
    entryType: 'extraction',
    sequence,
    occurredAt: at,
    actor: 'model',
    outputName: elementRef,
    rawValue,
    coerced: false,
  };
}

const loginPage = [
  textbox('element-1', 'User ID', true),
  textbox('element-2', 'Password', false),
  button('element-3', 'Sign On'),
];
const searchPage = [textbox('element-4', 'Member Number', false), button('element-5', 'Search')];
const detailPage = [
  cell('element-6', 'Member Name', 'JANE DOE'),
  cell('element-7', 'Regular Savings', '4,182.90'),
];

const loginAndLookUp: RunLog = {
  runId: 'run-8c31d',
  mode: 'discovery',
  goal: 'Look up member 100234 and read their regular savings balance',
  inputs: {},
  startedAt: at,
  completedAt: at,
  entries: [
    observed(0, 'http://localhost:4100/login', 'Sign On', loginPage),
    acted(1, { actionType: 'fill', target: targeting('element-1'), value: 'analyst' }),
    observed(2, 'http://localhost:4100/login', 'Sign On', loginPage),
    acted(3, { actionType: 'fill', target: targeting('element-2'), value: 'hunter2' }),
    observed(4, 'http://localhost:4100/login', 'Sign On', loginPage),
    acted(5, { actionType: 'click', target: targeting('element-3') }),
    observed(6, 'http://localhost:4100/search', 'Member Search', searchPage),
    acted(7, { actionType: 'fill', target: targeting('element-4'), value: '100234' }),
    observed(8, 'http://localhost:4100/search', 'Member Search', searchPage),
    acted(9, { actionType: 'click', target: targeting('element-5') }),
    observed(10, 'http://localhost:4100/member', 'Share Summary', detailPage),
    extracted(11, 'element-6', 'JANE DOE'),
    extracted(12, 'element-7', '4,182.90'),
  ],
  outcome: { classification: 'success', outputs: {} },
};

const options = {
  capabilityId: 'lookup-savings-balance',
  name: 'Look up savings',
  modelId: 'test-model',
};

const policy: Policy = {
  policyId: 'test-policy',
  name: 'Test Policy',
  allowedOrigins: ['http://localhost:4100'],
  rules: [{ actionClass: 'mutate', decision: 'allow' }],
  redactedFieldNames: ['password'],
  redactedPatterns: [],
  maxStepsPerRun: 30,
};

describe('Capability recording', () => {
  test('emits a usable artifact that satisfies the schema', () => {
    const capability = recordCapability(loginAndLookUp, options);

    expect(() => Capability.parse(capability)).not.toThrow();
    expect(capability.status).toBe('approved');
    expect(capability.version).toBe(1);
    expect(capability.provenance).toMatchObject({
      discoveredByModel: 'test-model',
      discoveryRunId: 'run-8c31d',
    });
  });

  test('a value traceable to the goal becomes an input the step reads by name', () => {
    const capability = recordCapability(loginAndLookUp, options);

    expect(capability.inputs).toEqual([
      {
        name: 'memberNumber',
        valueType: 'string',
        required: true,
        secret: false,
        description: 'Member Number',
      },
    ]);

    const memberNumberStep = capability.steps.find((step) => step.stepId === 'fill-memberNumber');
    expect(memberNumberStep?.action).toMatchObject({ value: '{{memberNumber}}' });
  });

  test('credentials the model supplied from nowhere else stay constants', () => {
    const capability = recordCapability(loginAndLookUp, options);

    const values = capability.steps
      .map((step) => (step.action.actionType === 'fill' ? step.action.value : null))
      .filter(Boolean);

    expect(values).toEqual(['analyst', 'hunter2', '{{memberNumber}}']);
    expect(capability.inputs.map((input) => input.name)).not.toContain('userId');
  });

  test('under a policy, a credential is held by reference instead of inlined', () => {
    const capability = recordCapability(loginAndLookUp, { ...options, policy });

    const password = capability.inputs.find((input) => input.name === 'password');
    expect(password).toMatchObject({ required: true, secret: true });

    const passwordStep = capability.steps.find((step) => step.stepId === 'fill-password');
    expect(passwordStep?.action).toMatchObject({ value: '{{password}}' });
    expect(JSON.stringify(capability)).not.toContain('hunter2');

    // The user ID is not a sensitive field, so it stays a constant of the flow.
    expect(capability.inputs.map((input) => input.name)).not.toContain('userId');
  });

  test('extracted values become typed outputs named after their label', () => {
    const capability = recordCapability(loginAndLookUp, options);

    expect(capability.outputs).toEqual([
      { name: 'memberName', valueType: 'string', required: true, description: 'Member Name' },
      {
        name: 'regularSavings',
        valueType: 'number',
        required: true,
        description: 'Regular Savings',
      },
    ]);
    expect(capability.extractions.map((extraction) => extraction.outputName)).toEqual([
      'memberName',
      'regularSavings',
    ]);
  });

  test('an em-dash cell is typed as a string, since replay could not read it as a number', () => {
    const emDashRun: RunLog = {
      ...loginAndLookUp,
      entries: [...loginAndLookUp.entries.slice(0, 12), extracted(12, 'element-7', '—')],
    };

    const capability = recordCapability(emDashRun, options);

    expect(capability.outputs.find((output) => output.name === 'regularSavings')?.valueType).toBe(
      'string',
    );
  });

  test('steps that changed the page carry a wait, steps that did not do not', () => {
    const capability = recordCapability(loginAndLookUp, options);

    const waits = Object.fromEntries(
      capability.steps.map((step) => [step.stepId, step.waitFor?.waitUntil ?? null]),
    );

    expect(waits['fill-userId']).toBeNull();
    expect(waits['click-signOn']).toBe('pageLoad');
    expect(waits['click-search']).toBe('pageLoad');
  });

  test('each step that changed the page is guarded by a URL checkpoint', () => {
    const capability = recordCapability(loginAndLookUp, options);

    const urlCheckpoints = capability.checkpoints.filter((checkpoint) =>
      checkpoint.allOf.every((assertion) => assertion.assert === 'url_matches'),
    );

    expect(
      urlCheckpoints.map((checkpoint) => [checkpoint.checkpointId, checkpoint.afterStepId]),
    ).toEqual([
      ['reached-search', 'click-signOn'],
      ['reached-member', 'click-search'],
    ]);

    // Only the path is asserted: the origin moves between environments and
    // tenants, the path is what says where the flow got to.
    const pattern = urlCheckpoints[0]!.allOf[0]!;
    expect(pattern).toMatchObject({ assert: 'url_matches' });
    expect(
      new RegExp((pattern as { pattern: string }).pattern).test('https://other.host/search'),
    ).toBe(true);
    expect(
      new RegExp((pattern as { pattern: string }).pattern).test(
        'http://localhost:4100/search-archive',
      ),
    ).toBe(false);
  });

  test('the extracted values are guarded by a checkpoint on the step that revealed them', () => {
    const capability = recordCapability(loginAndLookUp, options);

    const resultCheckpoint = capability.checkpoints.find(
      (checkpoint) => checkpoint.checkpointId === 'results-present',
    );

    // Both values appeared on the page the search landed on, so both are
    // asserted after that step — this is what tells a member who does not exist
    // apart from an extraction selector that has drifted.
    expect(resultCheckpoint?.afterStepId).toBe('click-search');
    expect(resultCheckpoint?.allOf).toHaveLength(2);
    expect(
      resultCheckpoint?.allOf.every((assertion) => assertion.assert === 'element_present'),
    ).toBe(true);
  });

  test('a URL carrying a supplied input is not turned into a checkpoint', () => {
    // /member/100234 would pin the capability to one member, which is the
    // opposite of what a checkpoint is for.
    const perMemberUrlRun: RunLog = {
      ...loginAndLookUp,
      inputs: { memberNumber: '100234' },
      entries: loginAndLookUp.entries.map((entry) =>
        entry.entryType === 'observation' && entry.observation.url.endsWith('/member')
          ? observed(
              entry.sequence,
              'http://localhost:4100/member/100234',
              'Share Summary',
              detailPage,
            )
          : entry,
      ),
    };

    const capability = recordCapability(perMemberUrlRun, options);

    expect(JSON.stringify(capability.checkpoints)).not.toContain('100234');
    expect(capability.checkpoints.map((checkpoint) => checkpoint.checkpointId)).not.toContain(
      'reached-member100234',
    );
  });

  test('no ephemeral discovery handle or extracted value leaks into the artifact', () => {
    const serialised = JSON.stringify(recordCapability(loginAndLookUp, options));

    expect(serialised).not.toContain('data-understudy-ref');
    expect(serialised).not.toContain('4,182.90');
    expect(serialised).not.toContain('JANE DOE');
  });

  test('a run that never reached its goal cannot be recorded', () => {
    const failedRun: RunLog = {
      ...loginAndLookUp,
      outcome: {
        classification: 'failed',
        failureCode: 'step_budget_exhausted',
        message: 'ran out of steps',
        interventionRaised: false,
      },
    };

    expect(() => recordCapability(failedRun, options)).toThrow(/no replayable path/);
  });
});
