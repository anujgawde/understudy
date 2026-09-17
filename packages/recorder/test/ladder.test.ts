import { describe, test, expect } from 'vitest';
import { LocatorLadder, type Action, type ObservedElement } from '@understudy/schemas';
import { deriveLadder } from '../src/ladder.js';
import type { DistilledStep } from '../src/distill.js';

function stepActingOn(elementRef: string, elements: ObservedElement[]): DistilledStep {
  const action: Action = {
    actionType: 'click',
    target: [{ strategy: 'css', selector: `[data-understudy-ref="${elementRef}"]` }],
  };

  return {
    sequence: 1,
    action,
    observationBefore: {
      url: 'http://localhost:4000/login',
      pageTitle: 'Meridian',
      elements,
      capturedAt: '2026-09-17T10:00:00.000Z',
    },
  };
}

const namedButton: ObservedElement = {
  elementRef: 'element-1',
  role: 'button',
  accessibleName: 'Sign On',
  isEnabled: true,
  isVisible: true,
  domId: 'ctl00_ContentMain_btnSignOn',
};

const unlabelledInput: ObservedElement = {
  elementRef: 'element-2',
  role: 'textbox',
  isEnabled: true,
  isVisible: true,
  domId: 'ctl00_ContentMain_txtPassword',
  nearbyText: ['Password'],
};

describe('Ladder derivation', () => {
  test('a named button leads with role, then its visible text, then its id', () => {
    const ladder = deriveLadder(stepActingOn('element-1', [namedButton]));

    expect(ladder).toEqual([
      { strategy: 'role', role: 'button', accessibleName: 'Sign On' },
      { strategy: 'text', text: 'Sign On', matchExactly: true },
      { strategy: 'css', selector: '#ctl00_ContentMain_btnSignOn' },
    ]);
  });

  test('an input the page labels with a bare cell falls back to the adjacent walk', () => {
    const ladder = deriveLadder(stepActingOn('element-2', [unlabelledInput]));

    expect(ladder).toEqual([
      { strategy: 'adjacent', labelText: 'Password', direction: 'next', targetRole: 'textbox' },
      { strategy: 'css', selector: '#ctl00_ContentMain_txtPassword' },
      { strategy: 'role', role: 'textbox', matchIndex: 0 },
    ]);
  });

  test('a test id outranks every other rung', () => {
    const ladder = deriveLadder(
      stepActingOn('element-3', [{ ...namedButton, elementRef: 'element-3', testId: 'sign-on' }]),
    );

    expect(ladder?.[0]).toEqual({ strategy: 'css', selector: '[data-testid="sign-on"]' });
  });

  test('an element with nothing distinctive still gets a positional rung', () => {
    const anonymousCells: ObservedElement[] = [
      { elementRef: 'element-1', role: 'cell', isEnabled: true, isVisible: true },
      { elementRef: 'element-2', role: 'cell', isEnabled: true, isVisible: true },
    ];

    const ladder = deriveLadder(stepActingOn('element-2', anonymousCells));

    expect(ladder).toEqual([{ strategy: 'role', role: 'cell', matchIndex: 1 }]);
  });

  test('an id that is not a plain css identifier is escaped as an attribute match', () => {
    const ladder = deriveLadder(
      stepActingOn('element-4', [
        { ...unlabelledInput, elementRef: 'element-4', domId: 'ctl00$Main$txt' },
      ]),
    );

    expect(ladder?.[1]).toEqual({ strategy: 'css', selector: '[id="ctl00$Main$txt"]' });
  });

  test('caps at the three rungs the schema allows', () => {
    const ladder = deriveLadder(
      stepActingOn('element-5', [{ ...namedButton, elementRef: 'element-5', testId: 'sign-on' }]),
    );

    expect(ladder).toHaveLength(3);
    expect(() => LocatorLadder.parse(ladder)).not.toThrow();
  });

  test('a navigate step has no element to locate', () => {
    const step: DistilledStep = {
      sequence: 1,
      action: { actionType: 'navigate', url: 'http://localhost:4000/login' },
      observationBefore: {
        url: 'http://localhost:4000/',
        pageTitle: 'Meridian',
        elements: [],
        capturedAt: '2026-09-17T10:00:00.000Z',
      },
    };

    expect(deriveLadder(step)).toBeNull();
  });

  test('the ephemeral discovery handle never survives into the ladder', () => {
    const ladder = deriveLadder(stepActingOn('element-1', [namedButton]));

    expect(JSON.stringify(ladder)).not.toContain('data-understudy-ref');
  });
});
