import { describe, test, expect, vi } from 'vitest';
import type { Capability, RunLog } from '@understudy/schemas';
import type { Surface } from '@understudy/surface';
import { verifyCapability } from '../src/verification.js';

const at = '2026-09-22T10:00:00.000Z';

function capability(): Capability {
  return {
    capabilityId: 'lookup',
    name: 'Look up a member',
    version: 1,
    goal: 'Look up member 12345 and read the savings balance',
    status: 'draft',
    inputs: [{ name: 'memberNumber', valueType: 'string', required: true, secret: false }],
    outputs: [{ name: 'savingsBalance', valueType: 'number', required: true }],
    steps: [
      {
        stepId: 'open',
        risk: 'reversible',
        action: { actionType: 'navigate', url: 'http://localhost:4000/login' },
      },
    ],
    checkpoints: [],
    extractions: [
      {
        outputName: 'savingsBalance',
        target: [{ strategy: 'css', selector: '#balance' }],
        valueType: 'number',
      },
    ],
    businessOutcomes: [],
    expectedDialogs: [],
    interstitials: [],
  };
}

/** A discovery run that read one value off the page. */
function discoveryRunLog(rawValue: string): RunLog {
  return {
    runId: 'discovery-1',
    mode: 'discovery',
    inputs: {},
    startedAt: at,
    entries: [
      {
        entryType: 'extraction',
        sequence: 0,
        occurredAt: at,
        actor: 'model',
        outputName: 'element-7',
        rawValue,
        coerced: false,
      },
    ],
  };
}

/** A surface that replays to whatever the test wants the page to say. */
function surfaceReturning(text: string): Surface {
  return {
    observe: vi.fn(),
    act: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue({ rungIndex: 0, rung: { strategy: 'css', selector: '#balance' }, matchCount: 1 }),
    extractText: vi.fn().mockResolvedValue({
      text,
      resolveResult: { rungIndex: 0, rung: { strategy: 'css', selector: '#balance' }, matchCount: 1 },
    }),
    pageUrl: vi.fn().mockResolvedValue('http://localhost:4000/members/detail'),
    hasText: vi.fn().mockResolvedValue(true),
    drainDialogs: vi.fn().mockResolvedValue([]),
    lastResponseStatus: vi.fn().mockReturnValue(200),
    clearResponseStatus: vi.fn(),
  } as unknown as Surface;
}

describe('Verify before approve', () => {
  test('a replay that returns what discovery read is approved', async () => {
    const result = await verifyCapability(
      capability(),
      surfaceReturning('$4,182.90'),
      { memberNumber: '12345' },
      discoveryRunLog('$4,182.90'),
    );

    expect(result.approved, result.reason).toBe(true);
  });

  test('formatting differences do not block approval', async () => {
    // Replay coerces "$4,182.90" to 4182.9; discovery recorded the string it
    // saw. Failing on that would reject artifacts that work perfectly.
    const result = await verifyCapability(
      capability(),
      surfaceReturning('4182.90'),
      { memberNumber: '12345' },
      discoveryRunLog('$4,182.90'),
    );

    expect(result.approved).toBe(true);
  });

  test('a replay that returns a different value stays a draft', async () => {
    // The dangerous case: the run succeeds, so nothing looks wrong, but the
    // locator resolved to something other than what discovery was reading.
    const result = await verifyCapability(
      capability(),
      surfaceReturning('$99.00'),
      { memberNumber: '12345' },
      discoveryRunLog('$4,182.90'),
    );

    expect(result.approved).toBe(false);
    expect(result.reason).toContain('different values');
  });

  test('a replay that cannot reach its output stays a draft', async () => {
    const surface = surfaceReturning('');
    vi.mocked(surface.extractText).mockRejectedValue(new Error('no rung matched'));

    const result = await verifyCapability(
      capability(),
      surface,
      { memberNumber: '12345' },
      discoveryRunLog('$4,182.90'),
    );

    expect(result.approved).toBe(false);
    expect(result.reason).toContain('did not succeed');
  }, 15_000);
});
