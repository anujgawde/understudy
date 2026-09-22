import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import type { Capability } from '@understudy/schemas';
import { PlaywrightSurface } from '@understudy/surface';
import { SessionRegistry } from '@understudy/session';
import { execute } from '../src/executor.js';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), '..', '..', '..');
const PORT = 4327;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForHealth(url: string, timeoutMilliseconds = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMilliseconds) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Target app did not become healthy at ${url}`);
}

/**
 * Log in, search a member number, open the row, and assert the share grid
 * arrived. Every test below replays this same flow and changes only the member
 * number, which is the point: one artifact, and the runtime condition — not the
 * capability — decides what comes back.
 *
 * The row is clicked by the member number in its own cell rather than by name,
 * so the step works for whichever member the test supplies.
 */
function makeLookupCapability(baseUrl: string, memberName: string): Capability {
  return {
    capabilityId: 'runtime-conditions-lookup',
    name: 'Member Lookup',
    version: 1,
    goal: 'Log in, search for a member by number, and read their share balances',
    status: 'approved',
    inputs: [{ name: 'memberNumber', valueType: 'string', required: true, secret: false }],
    outputs: [],
    steps: [
      {
        stepId: 'navigate-to-login',
        action: { actionType: 'navigate', url: `${baseUrl}/login` },
        risk: 'reversible',
      },
      {
        stepId: 'fill-user-id',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'adjacent', labelText: 'User ID', direction: 'next' }],
          value: 'tester',
        },
        risk: 'reversible',
      },
      {
        stepId: 'fill-password',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'adjacent', labelText: 'Password', direction: 'next' }],
          value: 'password',
        },
        risk: 'reversible',
      },
      {
        stepId: 'click-sign-in',
        action: {
          actionType: 'click',
          target: [{ strategy: 'role', role: 'button', accessibleName: 'Sign In' }],
        },
        waitFor: { waitUntil: 'pageLoad' },
        risk: 'reversible',
      },
      {
        stepId: 'fill-member-number',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'css', selector: '#ctl00_ContentMain_txtMbrNo' }],
          value: '{{memberNumber}}',
        },
        risk: 'reversible',
      },
      {
        stepId: 'click-search',
        action: {
          actionType: 'click',
          target: [{ strategy: 'css', selector: '#ctl00_ContentMain_btnSearch' }],
        },
        waitFor: { waitUntil: 'pageLoad' },
        risk: 'reversible',
      },
      {
        stepId: 'click-member-row',
        action: { actionType: 'click', target: [{ strategy: 'text', text: memberName }] },
        waitFor: { waitUntil: 'pageLoad' },
        risk: 'reversible',
      },
    ],
    checkpoints: [
      // The two places this flow can legitimately stop: the search coming back
      // with nothing to click, and the detail page coming back without the
      // balances. Both are checkpoints the recorder derives on its own.
      {
        checkpointId: 'results-present',
        afterStepId: 'click-search',
        allOf: [
          {
            assert: 'element_present',
            target: [{ strategy: 'css', selector: '#ctl00_ContentMain_grdResults tbody a' }],
          },
        ],
      },
      {
        checkpointId: 'shares-listed',
        afterStepId: 'click-member-row',
        allOf: [{ assert: 'text_present', text: 'Regular Share Savings' }],
      },
    ],
    extractions: [],
    // Two rules on the same checkpoint. Before signals existed the first one
    // listed won every time, whatever the page said, which is exactly what
    // these tests exist to stop happening again.
    businessOutcomes: [
      {
        code: 'member_not_found',
        message: 'No member matched that member number.',
        signal: { assert: 'text_present', text: 'No records matched' },
        condition: { when: 'checkpoint_failed', checkpointId: 'results-present' },
      },
      {
        code: 'validation_rejected',
        message: 'The member number was rejected by the search form.',
        signal: { assert: 'text_present', text: 'VAL-MBR-001' },
        condition: { when: 'checkpoint_failed', checkpointId: 'results-present' },
      },
      {
        code: 'access_denied',
        message: 'You are not authorized to view this member record.',
        signal: { assert: 'text_present', text: 'SEC-MBR-004' },
        condition: { when: 'checkpoint_failed', checkpointId: 'shares-listed' },
      },
    ],
    expectedDialogs: [],
    interstitials: [],
  };
}

describe('Runtime conditions during replay', () => {
  let targetApp: ChildProcess;
  let browser: Browser;
  let page: Page;
  let surface: PlaywrightSurface;

  beforeAll(async () => {
    const tsxBin = resolve(repoRoot, 'node_modules/.bin/tsx');
    targetApp = spawn(tsxBin, ['apps/target-app/src/index.ts'], {
      env: { ...process.env, TARGET_APP_PORT: String(PORT) },
      cwd: repoRoot,
      stdio: 'pipe',
    });

    targetApp.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (!text.includes('ExperimentalWarning')) process.stderr.write(text);
    });

    await waitForHealth(`${BASE_URL}/health`);

    browser = await chromium.launch();
    page = await browser.newPage();
    surface = new PlaywrightSurface(page);
  }, 30_000);

  afterAll(async () => {
    await page?.close();
    await browser?.close();
    targetApp?.kill();
  });

  test('an empty result set is the not-found outcome', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const { runLog } = await execute({
      capability: makeLookupCapability(BASE_URL, 'JOHNSON, MARGARET A'),
      surface,
      inputs: { memberNumber: '99999' },
    });

    expect(runLog.outcome?.classification).toBe('business_outcome');
    if (runLog.outcome?.classification === 'business_outcome') {
      expect(runLog.outcome.code).toBe('member_not_found');
    }
  });

  test(
    'a rejected input is its own outcome, not "no such member"',
    { timeout: 30_000 },
    async () => {
      await page.goto(`${BASE_URL}/logout`);

      const { runLog } = await execute({
        capability: makeLookupCapability(BASE_URL, 'JOHNSON, MARGARET A'),
        surface,
        inputs: { memberNumber: '88888' },
      });

      expect(runLog.outcome?.classification).toBe('business_outcome');
      if (runLog.outcome?.classification === 'business_outcome') {
        expect(runLog.outcome.code).toBe('validation_rejected');
      }

      // The not-found rule matched the same failed checkpoint and was refused on
      // its signal. The log says so, which is what makes the decision auditable.
      const ruleEntries = runLog.entries.filter((e) => e.entryType === 'outcome_rule');
      expect(ruleEntries).toContainEqual(
        expect.objectContaining({ code: 'member_not_found', signalPresent: false }),
      );
      expect(ruleEntries).toContainEqual(
        expect.objectContaining({ code: 'validation_rejected', signalPresent: true }),
      );
    },
  );

  test('a permission denial is a business outcome', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const { runLog } = await execute({
      capability: makeLookupCapability(BASE_URL, 'OKONKWO, SAMUEL T'),
      surface,
      inputs: { memberNumber: '55555' },
    });

    expect(runLog.outcome?.classification).toBe('business_outcome');
    if (runLog.outcome?.classification === 'business_outcome') {
      expect(runLog.outcome.code).toBe('access_denied');
    }
  });

  test('a 500 is a hard failure, never a business outcome', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const { runLog } = await execute({
      capability: makeLookupCapability(BASE_URL, 'REYES, CARMEN L'),
      surface,
      inputs: { memberNumber: '44444' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('app_error');
      expect(runLog.outcome.message).toContain('500');
    }
  });

  test('an undeclared dialog stops the run', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const { runLog } = await execute({
      capability: makeLookupCapability(BASE_URL, 'HALVORSEN, ERIK J'),
      surface,
      inputs: { memberNumber: '33333' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('unexpected_dialog');
    }

    const dialogs = runLog.entries.filter((e) => e.entryType === 'dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toMatchObject({ kind: 'confirm', expected: false });
  });

  test('a declared dialog does not stop the run', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability = makeLookupCapability(BASE_URL, 'HALVORSEN, ERIK J');

    const { runLog } = await execute({
      capability: { ...capability, expectedDialogs: ['pending dispute'] },
      surface,
      inputs: { memberNumber: '33333' },
    });

    expect(runLog.outcome?.classification).toBe('success');

    const dialogs = runLog.entries.filter((e) => e.entryType === 'dialog');
    expect(dialogs[0]).toMatchObject({ expected: true });
  });

  test('a declared interstitial is dismissed and recorded', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability = makeLookupCapability(BASE_URL, 'NAKAMURA, YUKI');

    const { runLog } = await execute({
      capability: {
        ...capability,
        interstitials: [
          {
            name: 'scheduled maintenance',
            when: { assert: 'text_present', text: 'SCHEDULED MAINTENANCE' },
            dismiss: [{ strategy: 'css', selector: '#ctl00_ContentMain_btnDismissNotice' }],
            risk: 'reversible' as const,
          },
        ],
      },
      surface,
      inputs: { memberNumber: '22222' },
    });

    expect(runLog.outcome?.classification).toBe('recovered');
    if (runLog.outcome?.classification === 'recovered') {
      expect(runLog.outcome.recoveries).toContainEqual(
        expect.objectContaining({ kind: 'dismissed_interstitial' }),
      );
    }
  });

  test(
    'an undeclared interstitial is left alone and the run fails',
    { timeout: 30_000 },
    async () => {
      await page.goto(`${BASE_URL}/logout`);

      const { runLog } = await execute({
        capability: makeLookupCapability(BASE_URL, 'NAKAMURA, YUKI'),
        surface,
        inputs: { memberNumber: '22222' },
      });

      expect(runLog.outcome?.classification).toBe('failed');
      if (runLog.outcome?.classification === 'failed') {
        expect(runLog.outcome.failureCode).toBe('assertion_failed');

        // The message has to say what was there, not only what was wanted —
        // otherwise whoever is debugging starts by reproducing the run.
        expect(runLog.outcome.message).toContain('expected text');
        expect(runLog.outcome.message).toContain('but not present anywhere on');
      }
    },
  );

  test('an irreversible step pauses for approval', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability = makeLookupCapability(BASE_URL, 'JOHNSON, MARGARET A');
    const registry = new SessionRegistry();
    registry.create('s1');
    registry.startRun('s1', 'run-1', capability.capabilityId);

    const { runLog, intervention } = await execute({
      capability: {
        ...capability,
        steps: capability.steps.map((step) =>
          step.stepId === 'click-search' ? { ...step, risk: 'irreversible' as const } : step,
        ),
      },
      surface,
      inputs: { memberNumber: '12345' },
      session: { registry, sessionId: 's1' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('approval_required');
      expect(runLog.outcome.failedAtStepId).toBe('click-search');
      expect(runLog.outcome.interventionRaised).toBe(true);
    }

    expect(intervention?.failureCode).toBe('approval_required');

    // The step never ran: the search was not submitted, so the page is still
    // the search form rather than a result set.
    const actions = runLog.entries.filter((e) => e.entryType === 'action');
    expect(actions.some((e) => e.entryType === 'action' && e.stepId === 'click-search')).toBe(
      false,
    );
  });

  test('an approved irreversible step runs', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability = makeLookupCapability(BASE_URL, 'JOHNSON, MARGARET A');

    const { runLog } = await execute({
      capability: {
        ...capability,
        steps: capability.steps.map((step) =>
          step.stepId === 'click-search' ? { ...step, risk: 'irreversible' as const } : step,
        ),
      },
      surface,
      inputs: { memberNumber: '12345' },
      approveIrreversible: true,
    });

    expect(runLog.outcome?.classification).toBe('success');
  });
});
