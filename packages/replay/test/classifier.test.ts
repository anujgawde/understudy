import { describe, test, expect } from 'vitest';
import type { BusinessOutcomeRule } from '@understudy/schemas';
import { classify, conditionMatches } from '../src/classifier.js';
import type { TerminalState } from '../src/types.js';

describe('Outcome classifier', () => {
  test('all steps completed with outputs → success', () => {
    const state: TerminalState = {
      completedAllSteps: true,
      outputs: { savingsBalance: 4182.9 },
    };

    const outcome = classify(state, []);

    expect(outcome.classification).toBe('success');
    if (outcome.classification === 'success') {
      expect(outcome.outputs).toEqual({ savingsBalance: 4182.9 });
    }
  });

  test('all steps completed with empty outputs → success', () => {
    const state: TerminalState = {
      completedAllSteps: true,
      outputs: {},
    };

    const outcome = classify(state, []);

    expect(outcome.classification).toBe('success');
    if (outcome.classification === 'success') {
      expect(outcome.outputs).toEqual({});
    }
  });

  test('step failure matching a business outcome rule → business_outcome', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'click-member-row',
      failureCode: 'locator_not_found',
      failureMessage: 'Step "click-member-row": no rung in the locator ladder matched',
      outputs: {},
    };

    const rules: BusinessOutcomeRule[] = [
      {
        code: 'record_not_found',
        message: 'No matching member was found',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: {
          when: 'step_failed',
          stepId: 'click-member-row',
          failureCode: 'locator_not_found',
        },
      },
    ];

    const outcome = classify(state, rules);

    expect(outcome.classification).toBe('business_outcome');
    if (outcome.classification === 'business_outcome') {
      expect(outcome.code).toBe('record_not_found');
      expect(outcome.message).toBe('No matching member was found');
    }
  });

  test('checkpoint failure matching a business outcome rule → business_outcome', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'click-search',
      failureCode: 'assertion_failed',
      failureMessage: 'Checkpoint "results-present" failed: expected text to be present',
      failedCheckpointId: 'results-present',
      outputs: {},
    };

    const rules: BusinessOutcomeRule[] = [
      {
        code: 'no_results',
        message: 'Search returned no results',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: {
          when: 'checkpoint_failed',
          checkpointId: 'results-present',
        },
      },
    ];

    const outcome = classify(state, rules);

    expect(outcome.classification).toBe('business_outcome');
    if (outcome.classification === 'business_outcome') {
      expect(outcome.code).toBe('no_results');
      expect(outcome.message).toBe('Search returned no results');
    }
  });

  test('step failure with no matching rule → failed', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'click-member-row',
      failureCode: 'locator_not_found',
      failureMessage: 'Step "click-member-row": no rung in the locator ladder matched',
      outputs: {},
    };

    const outcome = classify(state, []);

    expect(outcome.classification).toBe('failed');
    if (outcome.classification === 'failed') {
      expect(outcome.failureCode).toBe('locator_not_found');
      expect(outcome.failedAtStepId).toBe('click-member-row');
      expect(outcome.message).toContain('click-member-row');
      expect(outcome.interventionRaised).toBe(false);
    }
  });

  test('navigation failure → failed with navigation_failed code', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'go-to-login',
      failureCode: 'navigation_failed',
      failureMessage: 'Step "go-to-login": net::ERR_CONNECTION_REFUSED',
      outputs: {},
    };

    const outcome = classify(state, []);

    expect(outcome.classification).toBe('failed');
    if (outcome.classification === 'failed') {
      expect(outcome.failureCode).toBe('navigation_failed');
      expect(outcome.message).toContain('net::ERR_CONNECTION_REFUSED');
    }
  });

  test('extraction failure → failed with extraction_failed code', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failureCode: 'extraction_failed',
      failureMessage: 'Extraction "phantom": no rung in the locator ladder matched',
      outputs: {},
    };

    const outcome = classify(state, []);

    expect(outcome.classification).toBe('failed');
    if (outcome.classification === 'failed') {
      expect(outcome.failureCode).toBe('extraction_failed');
      expect(outcome.message).toContain('phantom');
    }
  });

  test('type coercion failure → failed with type_coercion_failed code', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failureCode: 'type_coercion_failed',
      failureMessage: 'Extraction "certificateAvailable": cannot coerce "—" to number',
      outputs: {},
    };

    const outcome = classify(state, []);

    expect(outcome.classification).toBe('failed');
    if (outcome.classification === 'failed') {
      expect(outcome.failureCode).toBe('type_coercion_failed');
      expect(outcome.message).toContain('certificateAvailable');
    }
  });

  test('condition does not match when the failure code differs', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'click-member-row',
      failureCode: 'timeout',
      failureMessage: 'Step "click-member-row": timed out waiting for element',
      outputs: {},
    };

    const rules: BusinessOutcomeRule[] = [
      {
        code: 'record_not_found',
        message: 'No matching member was found',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: {
          when: 'step_failed',
          stepId: 'click-member-row',
          failureCode: 'locator_not_found',
        },
      },
    ];

    expect(conditionMatches(rules[0]!, state)).toBe(false);
  });

  test('condition does not match when the step differs', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'click-sign-in',
      failureCode: 'locator_not_found',
      failureMessage: 'Step "click-sign-in": no rung matched',
      outputs: {},
    };

    const rules: BusinessOutcomeRule[] = [
      {
        code: 'record_not_found',
        message: 'No matching member was found',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: {
          when: 'step_failed',
          stepId: 'click-member-row',
          failureCode: 'locator_not_found',
        },
      },
    ];

    expect(conditionMatches(rules[0]!, state)).toBe(false);
  });

  test('first matching rule wins when multiple rules apply', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'click-member-row',
      failureCode: 'locator_not_found',
      failureMessage: 'Step "click-member-row": no rung matched',
      outputs: {},
    };

    const rules: BusinessOutcomeRule[] = [
      {
        code: 'record_not_found',
        message: 'No matching member was found',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: {
          when: 'step_failed',
          stepId: 'click-member-row',
          failureCode: 'locator_not_found',
        },
      },
      {
        code: 'alternate_not_found',
        message: 'Alternate message',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: {
          when: 'step_failed',
          stepId: 'click-member-row',
          failureCode: 'locator_not_found',
        },
      },
    ];

    const outcome = classify(state, rules);

    expect(outcome.classification).toBe('business_outcome');
    if (outcome.classification === 'business_outcome') {
      expect(outcome.code).toBe('record_not_found');
    }
  });

  test('a checkpoint condition does not match a step failure', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'click-member-row',
      failureCode: 'locator_not_found',
      failureMessage: 'Step "click-member-row": no rung matched',
      outputs: {},
    };

    const rules: BusinessOutcomeRule[] = [
      {
        code: 'no_results',
        message: 'Search returned no results',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: {
          when: 'checkpoint_failed',
          checkpointId: 'results-present',
        },
      },
    ];

    expect(conditionMatches(rules[0]!, state)).toBe(false);
  });

  test('missing failureMessage uses a default', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'some-step',
      failureCode: 'locator_not_found',
      outputs: {},
    };

    const outcome = classify(state, []);

    expect(outcome.classification).toBe('failed');
    if (outcome.classification === 'failed') {
      expect(outcome.message).toBe('Step "some-step" failed');
    }
  });

  // The ordering below is the fix for the bug this classifier shipped with: a
  // rule keyed on a failed checkpoint fired for every reason that checkpoint
  // could fail, so an expired session and a rejected input both came back as
  // "no such member".
  test('an expired session is never reported as a business outcome', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'click-search',
      failureCode: 'session_expired',
      failureMessage: 'Session expired before "click-search" could complete',
      failedCheckpointId: 'results-present',
      outputs: {},
    };

    const rules: BusinessOutcomeRule[] = [
      {
        code: 'no_results',
        message: 'Search returned no results',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: { when: 'checkpoint_failed', checkpointId: 'results-present' },
      },
    ];

    // The condition matched — the checkpoint really did fail — and the outcome
    // is still a failure, because of what made it fail.
    expect(conditionMatches(rules[0]!, state)).toBe(true);

    const outcome = classify(state, rules);

    expect(outcome.classification).toBe('failed');
    if (outcome.classification === 'failed') {
      expect(outcome.failureCode).toBe('session_expired');
    }
  });

  test('an application error is never reported as a business outcome', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'click-member-row',
      failureCode: 'app_error',
      failureMessage: 'Step "click-member-row": the application returned HTTP 500',
      failedCheckpointId: 'results-present',
      outputs: {},
    };

    const rules: BusinessOutcomeRule[] = [
      {
        code: 'no_results',
        message: 'Search returned no results',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: { when: 'checkpoint_failed', checkpointId: 'results-present' },
      },
    ];

    const outcome = classify(state, rules);

    expect(outcome.classification).toBe('failed');
    if (outcome.classification === 'failed') {
      expect(outcome.failureCode).toBe('app_error');
    }
  });

  test('a run stopped for approval is a failure, not a business outcome', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'click-post-transfer',
      failureCode: 'approval_required',
      failureMessage: 'Step "click-post-transfer" is marked irreversible and needs approval before it runs',
      outputs: {},
    };

    const outcome = classify(state, []);

    expect(outcome.classification).toBe('failed');
    if (outcome.classification === 'failed') {
      expect(outcome.failureCode).toBe('approval_required');
      expect(outcome.failedAtStepId).toBe('click-post-transfer');
    }
  });

  test('a rule whose signal was absent never reaches the classifier', () => {
    const state: TerminalState = {
      completedAllSteps: false,
      failedAtStepId: 'click-search',
      failureCode: 'assertion_failed',
      failureMessage: 'Checkpoint "results-present" failed',
      failedCheckpointId: 'results-present',
      outputs: {},
    };

    // What the executor hands over when the checkpoint failed but the page was
    // showing validation errors rather than the rule's own wording.
    const outcome = classify(state, []);

    expect(outcome.classification).toBe('failed');
    if (outcome.classification === 'failed') {
      expect(outcome.failureCode).toBe('assertion_failed');
    }
  });

  test('a recovered run carries what it recovered from', () => {
    const state: TerminalState = {
      completedAllSteps: true,
      recoveredFrom: 'assertion_failed',
      attempts: 2,
      recoveries: [
        {
          kind: 'dismissed_interstitial',
          atStepId: 'click-member-row',
          detail: 'dismissed the "scheduled maintenance" interstitial',
        },
      ],
      outputs: { savingsBalance: 2940.15 },
    };

    const outcome = classify(state, []);

    expect(outcome.classification).toBe('recovered');
    if (outcome.classification === 'recovered') {
      expect(outcome.outputs).toEqual({ savingsBalance: 2940.15 });
      expect(outcome.recoveries).toHaveLength(1);
      expect(outcome.recoveries[0]!.kind).toBe('dismissed_interstitial');
    }
  });

  test('success takes precedence even when business outcome rules exist', () => {
    const state: TerminalState = {
      completedAllSteps: true,
      outputs: { memberName: 'JOHNSON, MARGARET A' },
    };

    const rules: BusinessOutcomeRule[] = [
      {
        code: 'record_not_found',
        message: 'No matching member was found',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: {
          when: 'step_failed',
          stepId: 'click-member-row',
          failureCode: 'locator_not_found',
        },
      },
    ];

    const outcome = classify(state, rules);

    expect(outcome.classification).toBe('success');
    if (outcome.classification === 'success') {
      expect(outcome.outputs).toEqual({ memberName: 'JOHNSON, MARGARET A' });
    }
  });
});
