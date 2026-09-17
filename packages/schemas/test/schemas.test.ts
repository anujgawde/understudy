import { describe, expect, it } from 'vitest';
import { Action, LocatorLadder, Observation, Step } from '../src/index';

const memberNumberField: unknown = [
  { strategy: 'role', role: 'textbox', accessibleName: 'Member Number' },
  { strategy: 'adjacent', labelText: 'Member Number', direction: 'next', targetRole: 'textbox' },
  { strategy: 'css', selector: '#ctl00_ContentMain_txtMemberNo' },
];

describe('LocatorLadder', () => {
  it('accepts an ordered ladder of mixed strategies', () => {
    expect(LocatorLadder.parse(memberNumberField)).toHaveLength(3);
  });

  it('rejects an empty ladder', () => {
    expect(LocatorLadder.safeParse([]).success).toBe(false);
  });

  it('rejects more than three strategies', () => {
    const tooMany = [...(memberNumberField as unknown[]), { strategy: 'text', text: 'Member' }];
    expect(LocatorLadder.safeParse(tooMany).success).toBe(false);
  });

  it('rejects an unknown strategy', () => {
    expect(LocatorLadder.safeParse([{ strategy: 'xpath', path: '//input' }]).success).toBe(false);
  });
});

describe('Action', () => {
  it('parses each action type', () => {
    expect(Action.parse({ actionType: 'navigate', url: 'http://localhost:3000/login' })).toBeTruthy();
    expect(Action.parse({ actionType: 'click', target: memberNumberField })).toBeTruthy();
    expect(Action.parse({ actionType: 'fill', target: memberNumberField, value: '12345' })).toBeTruthy();
  });

  it('rejects a fill that is missing its value', () => {
    expect(Action.safeParse({ actionType: 'fill', target: memberNumberField }).success).toBe(false);
  });

  it('rejects a navigate to something that is not a url', () => {
    expect(Action.safeParse({ actionType: 'navigate', url: 'not-a-url' }).success).toBe(false);
  });
});

describe('Step', () => {
  it('parses a step with a wait condition', () => {
    const parsed = Step.parse({
      stepId: 'fill-member-number',
      action: { actionType: 'fill', target: memberNumberField, value: '12345' },
      waitFor: { waitUntil: 'textPresent', text: 'Search Results' },
    });
    expect(parsed.stepId).toBe('fill-member-number');
  });

  it('rejects an empty stepId', () => {
    const invalid = { stepId: '', action: { actionType: 'click', target: memberNumberField } };
    expect(Step.safeParse(invalid).success).toBe(false);
  });
});

describe('Observation', () => {
  it('parses a snapshot carrying dom enrichment', () => {
    const parsed = Observation.parse({
      url: 'http://localhost:3000/search',
      pageTitle: 'Member Search',
      capturedAt: '2026-09-16T18:00:00.000Z',
      elements: [
        {
          elementRef: 'element-1',
          role: 'textbox',
          isEnabled: true,
          isVisible: true,
          tagName: 'input',
          domId: 'ctl00_ContentMain_txtMemberNo',
          nearbyText: ['Member Number'],
        },
      ],
    });
    expect(parsed.elements[0]?.domId).toBe('ctl00_ContentMain_txtMemberNo');
  });

  it('rejects an element that is missing its visibility flags', () => {
    const invalid = {
      url: 'http://localhost:3000/search',
      pageTitle: 'Member Search',
      capturedAt: '2026-09-16T18:00:00.000Z',
      elements: [{ elementRef: 'element-1', role: 'textbox' }],
    };
    expect(Observation.safeParse(invalid).success).toBe(false);
  });
});
