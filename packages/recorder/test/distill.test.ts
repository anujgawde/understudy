import { describe, test, expect } from 'vitest';
import type { Action, Observation, RunLog, RunLogEntry } from '@understudy/schemas';
import { distillTrace } from '../src/distill.js';

const capturedAt = '2026-09-17T10:00:00.000Z';

function observation(url: string): Observation {
  return { url, pageTitle: 'Meridian', elements: [], capturedAt };
}

function fill(elementRef: string, value: string): Action {
  return {
    actionType: 'fill',
    target: [{ strategy: 'css', selector: `[data-understudy-ref="${elementRef}"]` }],
    value,
  };
}

function click(elementRef: string): Action {
  return {
    actionType: 'click',
    target: [{ strategy: 'css', selector: `[data-understudy-ref="${elementRef}"]` }],
  };
}

function runLogOf(
  entries: RunLogEntry[],
  classification: 'success' | 'failed' = 'success',
): RunLog {
  return {
    runId: 'run-1',
    mode: 'discovery',
    goal: 'Look up a member share balance',
    inputs: {},
    startedAt: capturedAt,
    completedAt: capturedAt,
    entries,
    outcome:
      classification === 'success'
        ? { classification: 'success', outputs: {} }
        : {
            classification: 'failed',
            failureCode: 'step_budget_exhausted',
            message: 'ran out of steps',
            interventionRaised: false,
          },
  };
}

function observed(sequence: number, url: string): RunLogEntry {
  return {
    entryType: 'observation',
    sequence,
    occurredAt: capturedAt,
    actor: 'system',
    observation: observation(url),
  };
}

function acted(sequence: number, action: Action, succeeded = true): RunLogEntry {
  return {
    entryType: 'action',
    sequence,
    occurredAt: capturedAt,
    actor: 'model',
    action,
    succeeded,
  };
}

describe('Trace distillation', () => {
  test('keeps successful actions in order and pairs each with the page state before it', () => {
    const steps = distillTrace(
      runLogOf([
        observed(0, 'http://localhost:4000/login'),
        acted(1, fill('e1', 'analyst')),
        observed(2, 'http://localhost:4000/login'),
        acted(3, click('e2')),
        observed(4, 'http://localhost:4000/search'),
      ]),
    );

    expect(steps.map((step) => step.sequence)).toEqual([1, 3]);
    expect(steps[0]?.observationBefore.url).toBe('http://localhost:4000/login');
    expect(steps[1]?.observationBefore.url).toBe('http://localhost:4000/login');
  });

  test('drops failed and policy-denied actions', () => {
    const steps = distillTrace(
      runLogOf([
        observed(0, 'http://localhost:4000/login'),
        acted(1, click('stale-ref'), false),
        observed(2, 'http://localhost:4000/login'),
        acted(3, click('e2')),
        observed(4, 'http://localhost:4000/search'),
      ]),
    );

    expect(steps.map((step) => step.sequence)).toEqual([3]);
  });

  test('collapses a self-correcting refill of the same field to the final value', () => {
    const steps = distillTrace(
      runLogOf([
        observed(0, 'http://localhost:4000/search'),
        acted(1, fill('e1', '10023')),
        observed(2, 'http://localhost:4000/search'),
        acted(3, fill('e1', '100234')),
        observed(4, 'http://localhost:4000/search'),
      ]),
    );

    expect(steps).toHaveLength(1);
    expect(steps[0]?.action).toEqual(fill('e1', '100234'));
  });

  test('drops a navigate to the page already open', () => {
    const steps = distillTrace(
      runLogOf([
        observed(0, 'http://localhost:4000/search'),
        acted(1, { actionType: 'navigate', url: 'http://localhost:4000/search' }),
        observed(2, 'http://localhost:4000/search'),
      ]),
    );

    expect(steps).toEqual([]);
  });

  test('truncates wandering that happened after the last extraction', () => {
    const steps = distillTrace(
      runLogOf([
        observed(0, 'http://localhost:4000/detail'),
        acted(1, click('e1')),
        observed(2, 'http://localhost:4000/detail'),
        {
          entryType: 'extraction',
          sequence: 3,
          occurredAt: capturedAt,
          actor: 'model',
          outputName: 'e9',
          rawValue: '4182.90',
          coerced: false,
        },
        acted(4, click('e7')),
        observed(5, 'http://localhost:4000/other'),
      ]),
    );

    expect(steps.map((step) => step.sequence)).toEqual([1]);
  });

  test('a run that never reached the goal has no path to record', () => {
    const steps = distillTrace(
      runLogOf([observed(0, 'http://localhost:4000/login'), acted(1, click('e2'))], 'failed'),
    );

    expect(steps).toEqual([]);
  });
});
