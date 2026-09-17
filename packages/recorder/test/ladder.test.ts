import { describe, test, expect } from 'vitest';
import { LocatorLadder, type Observation, type ObservedElement } from '@understudy/schemas';
import { deriveLadder } from '../src/ladder.js';

function pageShowing(elements: ObservedElement[]): Observation {
  return {
    url: 'http://localhost:4000/login',
    pageTitle: 'Meridian',
    elements,
    capturedAt: '2026-09-17T10:00:00.000Z',
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
    const ladder = deriveLadder('element-1', pageShowing([namedButton]));

    expect(ladder).toEqual([
      { strategy: 'role', role: 'button', accessibleName: 'Sign On' },
      { strategy: 'text', text: 'Sign On', matchExactly: true },
      { strategy: 'css', selector: '#ctl00_ContentMain_btnSignOn' },
    ]);
  });

  test('an input the page labels with a bare cell falls back to the adjacent walk', () => {
    const ladder = deriveLadder('element-2', pageShowing([unlabelledInput]));

    expect(ladder).toEqual([
      { strategy: 'adjacent', labelText: 'Password', direction: 'next', targetRole: 'textbox' },
      { strategy: 'css', selector: '#ctl00_ContentMain_txtPassword' },
      { strategy: 'role', role: 'textbox', matchIndex: 0 },
    ]);
  });

  test('a cell is located by its label, never by the data it happens to hold', () => {
    const balanceCell: ObservedElement = {
      elementRef: 'element-9',
      role: 'cell',
      accessibleName: '4,182.90',
      isEnabled: true,
      isVisible: true,
      nearbyText: ['Regular Savings'],
    };

    const ladder = deriveLadder('element-9', pageShowing([balanceCell]));

    expect(ladder).toEqual([
      { strategy: 'adjacent', labelText: 'Regular Savings', direction: 'next' },
      { strategy: 'role', role: 'cell', matchIndex: 0 },
    ]);
    expect(JSON.stringify(ladder)).not.toContain('4,182.90');
  });

  test('a test id outranks every other rung', () => {
    const ladder = deriveLadder(
      'element-3',
      pageShowing([{ ...namedButton, elementRef: 'element-3', testId: 'sign-on' }]),
    );

    expect(ladder?.[0]).toEqual({ strategy: 'css', selector: '[data-testid="sign-on"]' });
  });

  test('an element with nothing distinctive still gets a positional rung', () => {
    const anonymousCells: ObservedElement[] = [
      { elementRef: 'element-1', role: 'cell', isEnabled: true, isVisible: true },
      { elementRef: 'element-2', role: 'cell', isEnabled: true, isVisible: true },
    ];

    const ladder = deriveLadder('element-2', pageShowing(anonymousCells));

    expect(ladder).toEqual([{ strategy: 'role', role: 'cell', matchIndex: 1 }]);
  });

  test('an id that is not a plain css identifier is escaped as an attribute match', () => {
    const ladder = deriveLadder(
      'element-4',
      pageShowing([{ ...unlabelledInput, elementRef: 'element-4', domId: 'ctl00$Main$txt' }]),
    );

    expect(ladder?.[1]).toEqual({ strategy: 'css', selector: '[id="ctl00$Main$txt"]' });
  });

  test('caps at the three rungs the schema allows', () => {
    const ladder = deriveLadder(
      'element-5',
      pageShowing([{ ...namedButton, elementRef: 'element-5', testId: 'sign-on' }]),
    );

    expect(ladder).toHaveLength(3);
    expect(() => LocatorLadder.parse(ladder)).not.toThrow();
  });

  test('an element the page never showed has no ladder', () => {
    expect(deriveLadder('element-99', pageShowing([namedButton]))).toBeNull();
  });

  test('the ephemeral discovery handle never survives into the ladder', () => {
    const ladder = deriveLadder('element-1', pageShowing([namedButton]));

    expect(JSON.stringify(ladder)).not.toContain('data-understudy-ref');
  });
});
