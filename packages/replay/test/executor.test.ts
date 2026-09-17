import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import type { Capability } from '@understudy/schemas';
import { PlaywrightSurface } from '@understudy/surface';
import { execute } from '../src/executor.js';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), '..', '..', '..');
const PORT = 4324;
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

function makeLookupCapability(baseUrl: string): Capability {
  return {
    capabilityId: 'test-member-lookup',
    name: 'Member Lookup',
    version: 1,
    goal: 'Log in, search for a member by number, and navigate to their detail page',
    status: 'approved',
    inputs: [
      { name: 'memberNumber', valueType: 'string', required: true },
    ],
    outputs: [],
    steps: [
      {
        stepId: 'navigate-to-login',
        action: { actionType: 'navigate', url: `${baseUrl}/login` },
      },
      {
        stepId: 'fill-user-id',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'adjacent', labelText: 'User ID', direction: 'next' }],
          value: 'tester',
        },
      },
      {
        stepId: 'fill-password',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'adjacent', labelText: 'Password', direction: 'next' }],
          value: 'password',
        },
      },
      {
        stepId: 'click-sign-in',
        action: {
          actionType: 'click',
          target: [{ strategy: 'role', role: 'button', accessibleName: 'Sign In' }],
        },
        waitFor: { waitUntil: 'pageLoad' },
      },
      {
        stepId: 'fill-member-number',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'css', selector: '#ctl00_ContentMain_txtMbrNo' }],
          value: '{{memberNumber}}',
        },
      },
      {
        stepId: 'click-search',
        action: {
          actionType: 'click',
          target: [{ strategy: 'css', selector: '#ctl00_ContentMain_btnSearch' }],
        },
        waitFor: { waitUntil: 'pageLoad' },
      },
      {
        stepId: 'click-member-row',
        action: {
          actionType: 'click',
          target: [{ strategy: 'text', text: 'JOHNSON, MARGARET A' }],
        },
        waitFor: { waitUntil: 'pageLoad' },
      },
    ],
    checkpoints: [],
    extractions: [],
  };
}

describe('Executor', () => {
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

  test('replays login → search → detail and returns success', { timeout: 30_000 }, async () => {
    const capability = makeLookupCapability(BASE_URL);

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.mode).toBe('replay');
    expect(runLog.capabilityId).toBe('test-member-lookup');
    expect(runLog.inputs).toEqual({ memberNumber: '12345' });
    expect(runLog.outcome?.classification).toBe('success');
    expect(runLog.completedAt).toBeDefined();

    const actionEntries = runLog.entries.filter((e) => e.entryType === 'action');
    expect(actionEntries).toHaveLength(capability.steps.length);
    expect(actionEntries.every((e) => e.entryType === 'action' && e.succeeded)).toBe(true);

    expect(page.url()).toContain('/members/detail');
  });

  test('run log entries have sequential sequence numbers', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability = makeLookupCapability(BASE_URL);
    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    for (let index = 0; index < runLog.entries.length; index++) {
      expect(runLog.entries[index]!.sequence).toBe(index);
    }
  });

  test('input substitution replaces {{memberNumber}} in fill value', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability = makeLookupCapability(BASE_URL);
    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '67890' },
    });

    const fillMemberStep = runLog.entries.find(
      (e) => e.entryType === 'action' && e.stepId === 'fill-member-number',
    );
    expect(fillMemberStep).toBeDefined();
    if (fillMemberStep?.entryType === 'action') {
      expect(fillMemberStep.action.actionType).toBe('fill');
      if (fillMemberStep.action.actionType === 'fill') {
        expect(fillMemberStep.action.value).toBe('67890');
      }
    }
  });

  test('records resolvedByIndex for locator-based actions', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability = makeLookupCapability(BASE_URL);
    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    const clickSignIn = runLog.entries.find(
      (e) => e.entryType === 'action' && e.stepId === 'click-sign-in',
    );
    expect(clickSignIn).toBeDefined();
    if (clickSignIn?.entryType === 'action') {
      expect(clickSignIn.resolvedByIndex).toBe(0);
    }
  });

  test('fails with locator_not_found when a target cannot be resolved', { timeout: 15_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      capabilityId: 'test-bad-locator',
      name: 'Bad Locator Test',
      version: 1,
      goal: 'Attempt to click a nonexistent element',
      status: 'approved',
      inputs: [],
      outputs: [],
      steps: [
        {
          stepId: 'navigate',
          action: { actionType: 'navigate', url: `${BASE_URL}/login` },
        },
        {
          stepId: 'click-ghost',
          action: {
            actionType: 'click',
            target: [
              { strategy: 'role', role: 'button', accessibleName: 'Nonexistent Button' },
              { strategy: 'css', selector: '#does_not_exist' },
            ],
          },
        },
      ],
      checkpoints: [],
      extractions: [],
    };

    const { runLog } = await execute({ capability, surface, inputs: {} });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('locator_not_found');
      expect(runLog.outcome.failedAtStepId).toBe('click-ghost');
    }

    const failedEntry = runLog.entries.find(
      (e) => e.entryType === 'action' && e.stepId === 'click-ghost',
    );
    expect(failedEntry).toBeDefined();
    if (failedEntry?.entryType === 'action') {
      expect(failedEntry.succeeded).toBe(false);
    }
  });

  test('fails when a referenced input is not supplied', async () => {
    const capability: Capability = {
      capabilityId: 'test-missing-input',
      name: 'Missing Input Test',
      version: 1,
      goal: 'Reference an input that was not supplied',
      status: 'approved',
      inputs: [{ name: 'memberNumber', valueType: 'string', required: true }],
      outputs: [],
      steps: [
        {
          stepId: 'fill-something',
          action: {
            actionType: 'fill',
            target: [{ strategy: 'css', selector: '#anything' }],
            value: '{{memberNumber}}',
          },
        },
      ],
      checkpoints: [],
      extractions: [],
    };

    await expect(
      execute({ capability, surface, inputs: {} }),
    ).rejects.toThrow(/Input "{{memberNumber}}" referenced in action but not supplied/);
  });

  test('custom runId is used when provided', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      capabilityId: 'test-custom-run-id',
      name: 'Custom Run ID Test',
      version: 1,
      goal: 'Verify custom runId propagates',
      status: 'approved',
      inputs: [],
      outputs: [],
      steps: [
        {
          stepId: 'navigate',
          action: { actionType: 'navigate', url: `${BASE_URL}/login` },
        },
      ],
      checkpoints: [],
      extractions: [],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: {},
      runId: 'my-custom-run-id',
    });

    expect(runLog.runId).toBe('my-custom-run-id');
  });

  test('passing checkpoint records an assertion entry and succeeds', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-checkpoint-pass',
      checkpoints: [
        {
          checkpointId: 'on-detail-page',
          afterStepId: 'click-member-row',
          allOf: [
            { assert: 'text_present', text: 'SHARE SUMMARY' },
            { assert: 'url_matches', pattern: '/members/detail' },
          ],
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('success');

    const assertionEntry = runLog.entries.find((e) => e.entryType === 'assertion');
    expect(assertionEntry).toBeDefined();
    if (assertionEntry?.entryType === 'assertion') {
      expect(assertionEntry.checkpointId).toBe('on-detail-page');
      expect(assertionEntry.passed).toBe(true);
    }
  });

  test('failing text_present assertion stops the run with assertion_failed', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-checkpoint-fail',
      checkpoints: [
        {
          checkpointId: 'bogus-text-check',
          afterStepId: 'click-member-row',
          allOf: [
            { assert: 'text_present', text: 'THIS TEXT DOES NOT EXIST ON THE PAGE' },
          ],
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('assertion_failed');
      expect(runLog.outcome.message).toContain('bogus-text-check');
      expect(runLog.outcome.failedAtStepId).toBe('click-member-row');
    }

    const assertionEntry = runLog.entries.find((e) => e.entryType === 'assertion');
    expect(assertionEntry).toBeDefined();
    if (assertionEntry?.entryType === 'assertion') {
      expect(assertionEntry.passed).toBe(false);
    }
  });

  test('text_absent assertion passes when text is missing', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-text-absent',
      checkpoints: [
        {
          checkpointId: 'no-error-text',
          afterStepId: 'click-member-row',
          allOf: [
            { assert: 'text_absent', text: 'No records matched the supplied criteria' },
          ],
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('success');
    const assertionEntry = runLog.entries.find((e) => e.entryType === 'assertion');
    expect(assertionEntry).toBeDefined();
    if (assertionEntry?.entryType === 'assertion') {
      expect(assertionEntry.passed).toBe(true);
    }
  });

  test('element_present assertion passes when locator resolves', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-element-present',
      checkpoints: [
        {
          checkpointId: 'shares-grid-present',
          afterStepId: 'click-member-row',
          allOf: [
            { assert: 'element_present', target: [{ strategy: 'css', selector: '#ctl00_ContentMain_grdShares' }] },
          ],
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('success');
  });

  test('element_present assertion fails when locator does not resolve', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-element-missing',
      checkpoints: [
        {
          checkpointId: 'ghost-element',
          afterStepId: 'click-member-row',
          allOf: [
            { assert: 'element_present', target: [{ strategy: 'css', selector: '#does_not_exist' }] },
          ],
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('assertion_failed');
      expect(runLog.outcome.message).toContain('ghost-element');
    }
  });

  test('url_matches assertion fails when pattern does not match', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-url-mismatch',
      checkpoints: [
        {
          checkpointId: 'wrong-url',
          afterStepId: 'click-sign-in',
          allOf: [
            { assert: 'url_matches', pattern: '/members/detail' },
          ],
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('assertion_failed');
      expect(runLog.outcome.failedAtStepId).toBe('click-sign-in');
    }

    const actionEntries = runLog.entries.filter((e) => e.entryType === 'action');
    expect(actionEntries.length).toBe(4);
  });

  test('extracts string output from the page', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-extract-string',
      outputs: [
        { name: 'memberName', valueType: 'string', required: true },
      ],
      extractions: [
        {
          outputName: 'memberName',
          target: [
            {
              strategy: 'css',
              selector: '.ctl00_MemberInfo tr:first-child td:nth-child(4)',
            },
          ],
          valueType: 'string',
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('success');
    if (runLog.outcome?.classification === 'success') {
      expect(runLog.outcome.outputs['memberName']).toBe('JOHNSON, MARGARET A');
    }

    const extractionEntry = runLog.entries.find((e) => e.entryType === 'extraction');
    expect(extractionEntry).toBeDefined();
    if (extractionEntry?.entryType === 'extraction') {
      expect(extractionEntry.outputName).toBe('memberName');
      expect(extractionEntry.rawValue).toBe('JOHNSON, MARGARET A');
      expect(extractionEntry.coerced).toBe(false);
    }
  });

  test('extracts and coerces a numeric balance', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-extract-number',
      outputs: [
        { name: 'savingsBalance', valueType: 'number', required: true },
      ],
      extractions: [
        {
          outputName: 'savingsBalance',
          target: [
            {
              strategy: 'css',
              selector: '#ctl00_ContentMain_grdShares tbody tr:first-child td:nth-child(3)',
            },
          ],
          valueType: 'number',
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('success');
    if (runLog.outcome?.classification === 'success') {
      expect(runLog.outcome.outputs['savingsBalance']).toBe(4182.9);
    }

    const extractionEntry = runLog.entries.find((e) => e.entryType === 'extraction');
    expect(extractionEntry).toBeDefined();
    if (extractionEntry?.entryType === 'extraction') {
      expect(extractionEntry.coerced).toBe(true);
    }
  });

  test('em-dash Available cell fails numeric coercion', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-emdash-coercion',
      outputs: [
        { name: 'certificateAvailable', valueType: 'number', required: true },
      ],
      extractions: [
        {
          outputName: 'certificateAvailable',
          target: [
            {
              strategy: 'css',
              selector: '#ctl00_ContentMain_grdShares tbody tr:nth-child(3) td:nth-child(4)',
            },
          ],
          valueType: 'number',
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('type_coercion_failed');
      expect(runLog.outcome.message).toContain('certificateAvailable');
    }

    const extractionEntry = runLog.entries.find((e) => e.entryType === 'extraction');
    expect(extractionEntry).toBeDefined();
    if (extractionEntry?.entryType === 'extraction') {
      expect(extractionEntry.rawValue).toBe('—');
      expect(extractionEntry.coerced).toBe(false);
    }
  });

  test('extraction with unresolvable locator fails with extraction_failed', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-extract-missing',
      outputs: [
        { name: 'phantom', valueType: 'string', required: true },
      ],
      extractions: [
        {
          outputName: 'phantom',
          target: [{ strategy: 'css', selector: '#does_not_exist_at_all' }],
          valueType: 'string',
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('extraction_failed');
      expect(runLog.outcome.message).toContain('phantom');
    }
  });

  test('multiple extractions populate outputs and stop on first coercion failure', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-multi-extract',
      outputs: [
        { name: 'memberName', valueType: 'string', required: true },
        { name: 'certificateAvailable', valueType: 'number', required: true },
        { name: 'savingsBalance', valueType: 'number', required: true },
      ],
      extractions: [
        {
          outputName: 'memberName',
          target: [
            {
              strategy: 'css',
              selector: '.ctl00_MemberInfo tr:first-child td:nth-child(4)',
            },
          ],
          valueType: 'string',
        },
        {
          outputName: 'certificateAvailable',
          target: [
            {
              strategy: 'css',
              selector: '#ctl00_ContentMain_grdShares tbody tr:nth-child(3) td:nth-child(4)',
            },
          ],
          valueType: 'number',
        },
        {
          outputName: 'savingsBalance',
          target: [
            {
              strategy: 'css',
              selector: '#ctl00_ContentMain_grdShares tbody tr:first-child td:nth-child(3)',
            },
          ],
          valueType: 'number',
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('type_coercion_failed');
      expect(runLog.outcome.message).toContain('certificateAvailable');
    }

    const extractionEntries = runLog.entries.filter((e) => e.entryType === 'extraction');
    expect(extractionEntries).toHaveLength(2);
    expect((extractionEntries[0] as { outputName: string }).outputName).toBe('memberName');
    expect((extractionEntries[1] as { outputName: string }).outputName).toBe('certificateAvailable');
  });

  test('all_of requires every assertion to pass', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      ...makeLookupCapability(BASE_URL),
      capabilityId: 'test-all-of-partial',
      checkpoints: [
        {
          checkpointId: 'mixed-assertions',
          afterStepId: 'click-member-row',
          allOf: [
            { assert: 'text_present', text: 'SHARE SUMMARY' },
            { assert: 'text_present', text: 'THIS WILL NOT BE FOUND' },
          ],
        },
      ],
    };

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('assertion_failed');
    }
  });

  test('checkpoint failure stops execution of subsequent steps', { timeout: 30_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      capabilityId: 'test-checkpoint-stops-steps',
      name: 'Checkpoint Stops Execution',
      version: 1,
      goal: 'Verify checkpoint failure prevents remaining steps from running',
      status: 'approved',
      inputs: [],
      outputs: [],
      steps: [
        {
          stepId: 'navigate',
          action: { actionType: 'navigate', url: `${BASE_URL}/login` },
        },
        {
          stepId: 'never-reached',
          action: { actionType: 'navigate', url: `${BASE_URL}/login` },
        },
      ],
      checkpoints: [
        {
          checkpointId: 'early-fail',
          afterStepId: 'navigate',
          allOf: [
            { assert: 'text_present', text: 'NONEXISTENT PAGE CONTENT' },
          ],
        },
      ],
      extractions: [],
    };

    const { runLog } = await execute({ capability, surface, inputs: {} });

    const stepIds = runLog.entries
      .filter((e) => e.entryType === 'action')
      .map((e) => (e as Extract<typeof e, { entryType: 'action' }>).stepId);

    expect(stepIds).toContain('navigate');
    expect(stepIds).not.toContain('never-reached');
    expect(runLog.outcome?.classification).toBe('failed');
  });

  test('stops at the failed step and does not execute remaining steps', { timeout: 15_000 }, async () => {
    await page.goto(`${BASE_URL}/logout`);

    const capability: Capability = {
      capabilityId: 'test-stops-early',
      name: 'Stops Early Test',
      version: 1,
      goal: 'Fail on second step, third should not execute',
      status: 'approved',
      inputs: [],
      outputs: [],
      steps: [
        {
          stepId: 'step-1-ok',
          action: { actionType: 'navigate', url: `${BASE_URL}/login` },
        },
        {
          stepId: 'step-2-fails',
          action: {
            actionType: 'click',
            target: [{ strategy: 'css', selector: '#does_not_exist' }],
          },
        },
        {
          stepId: 'step-3-never-reached',
          action: { actionType: 'navigate', url: `${BASE_URL}/login` },
        },
      ],
      checkpoints: [],
      extractions: [],
    };

    const { runLog } = await execute({ capability, surface, inputs: {} });

    const stepIds = runLog.entries
      .filter((e) => e.entryType === 'action')
      .map((e) => (e as Extract<typeof e, { entryType: 'action' }>).stepId);

    expect(stepIds).toContain('step-1-ok');
    expect(stepIds).toContain('step-2-fails');
    expect(stepIds).not.toContain('step-3-never-reached');
  });
});
