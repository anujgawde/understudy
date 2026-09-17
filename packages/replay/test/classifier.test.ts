import { describe, test, expect } from 'vitest';
import type { BusinessOutcomeRule } from '@understudy/schemas';
import { classify, type TerminalState } from '../src/classifier.js';

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

  test('rule matches step but wrong failure code → failed', () => {
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
        condition: {
          when: 'step_failed',
          stepId: 'click-member-row',
          failureCode: 'locator_not_found',
        },
      },
    ];

    const outcome = classify(state, rules);

    expect(outcome.classification).toBe('failed');
    if (outcome.classification === 'failed') {
      expect(outcome.failureCode).toBe('timeout');
    }
  });

  test('rule matches failure code but wrong step → failed', () => {
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
        condition: {
          when: 'step_failed',
          stepId: 'click-member-row',
          failureCode: 'locator_not_found',
        },
      },
    ];

    const outcome = classify(state, rules);

    expect(outcome.classification).toBe('failed');
    if (outcome.classification === 'failed') {
      expect(outcome.failedAtStepId).toBe('click-sign-in');
    }
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
        condition: {
          when: 'step_failed',
          stepId: 'click-member-row',
          failureCode: 'locator_not_found',
        },
      },
      {
        code: 'alternate_not_found',
        message: 'Alternate message',
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

  test('checkpoint rule does not match a step failure', () => {
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
        condition: {
          when: 'checkpoint_failed',
          checkpointId: 'results-present',
        },
      },
    ];

    const outcome = classify(state, rules);

    expect(outcome.classification).toBe('failed');
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

  test('success takes precedence even when business outcome rules exist', () => {
    const state: TerminalState = {
      completedAllSteps: true,
      outputs: { memberName: 'JOHNSON, MARGARET A' },
    };

    const rules: BusinessOutcomeRule[] = [
      {
        code: 'record_not_found',
        message: 'No matching member was found',
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
