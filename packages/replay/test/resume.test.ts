import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import type { Capability } from '@understudy/schemas';
import { PlaywrightSurface } from '@understudy/surface';
import { SessionRegistry, handOff, handBack, resolveIntervention } from '@understudy/session';
import { execute, reassert } from '../src/executor.js';

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

// A checkpoint after sign-in gives the re-assertion gate something to verify
// when the run resumes at the search step.
function makeGuardedCapability(baseUrl: string): Capability {
  return {
    capabilityId: 'test-guarded-lookup',
    name: 'Guarded Member Lookup',
    version: 1,
    goal: 'Log in and search for a member, with the search page guarded by a checkpoint',
    status: 'approved',
    inputs: [{ name: 'memberNumber', valueType: 'string', required: true, secret: false }],
    outputs: [],
    steps: [
      { stepId: 'navigate-to-login', risk: 'reversible', action: { actionType: 'navigate', url: `${baseUrl}/login` } },
      {
        stepId: 'fill-user-id',
        risk: 'reversible',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'adjacent', labelText: 'User ID', direction: 'next' }],
          value: 'tester',
        },
      },
      {
        stepId: 'fill-password',
        risk: 'reversible',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'adjacent', labelText: 'Password', direction: 'next' }],
          value: 'password',
        },
      },
      {
        stepId: 'click-sign-in',
        risk: 'reversible',
        action: {
          actionType: 'click',
          target: [{ strategy: 'role', role: 'button', accessibleName: 'Sign In' }],
        },
        waitFor: { waitUntil: 'pageLoad' },
      },
      {
        stepId: 'fill-member-number',
        risk: 'reversible',
        action: {
          actionType: 'fill',
          target: [{ strategy: 'css', selector: '#ctl00_ContentMain_txtMbrNo' }],
          value: '{{memberNumber}}',
        },
      },
      {
        stepId: 'click-search',
        risk: 'reversible',
        action: {
          actionType: 'click',
          target: [{ strategy: 'css', selector: '#ctl00_ContentMain_btnSearch' }],
        },
        waitFor: { waitUntil: 'pageLoad' },
      },
    ],
    checkpoints: [
      {
        checkpointId: 'on-search-page',
        afterStepId: 'click-sign-in',
        allOf: [{ assert: 'text_present', text: 'SEARCH CRITERIA' }],
      },
    ],
    extractions: [],
    businessOutcomes: [],
    expectedDialogs: [],
    interstitials: [],
  };
}

// Same shape as the guarded capability, but the search result is guarded so a
// bounce back to the login page surfaces as a failure rather than passing.
function makeSearchCapability(baseUrl: string): Capability {
  const base = makeGuardedCapability(baseUrl);
  return {
    ...base,
    capabilityId: 'test-search-lookup',
    checkpoints: [
      ...base.checkpoints,
      {
        checkpointId: 'results-shown',
        afterStepId: 'click-search',
        allOf: [{ assert: 'text_present', text: 'JOHNSON, MARGARET A' }],
      },
    ],
  };
}

describe('Session expiry detection', () => {
  let targetApp: ChildProcess;
  let browser: Browser;
  let page: Page;
  let surface: PlaywrightSurface;

  beforeAll(async () => {
    const tsxBin = resolve(repoRoot, 'node_modules/.bin/tsx');
    targetApp = spawn(tsxBin, ['apps/target-app/src/index.ts'], {
      env: { ...process.env, TARGET_APP_PORT: String(PORT + 1) },
      cwd: repoRoot,
      stdio: 'pipe',
    });
    targetApp.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (!text.includes('ExperimentalWarning')) process.stderr.write(text);
    });
    await waitForHealth(`http://127.0.0.1:${PORT + 1}/health`);

    browser = await chromium.launch();
    page = await browser.newPage();
    surface = new PlaywrightSurface(page);
  }, 30_000);

  afterAll(async () => {
    await page?.close();
    await browser?.close();
    targetApp?.kill();
  });

  const baseUrl = () => `http://127.0.0.1:${PORT + 1}`;

  test('a session dropped mid-run is reported as session_expired', async () => {
    await page.goto(`${baseUrl()}/logout`);
    const capability = makeSearchCapability(baseUrl());

    // The app answers the timeout by returning login HTML without changing the
    // URL, so this only passes if the password field is what gives it away.
    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '77777' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('session_expired');
    }
    expect(page.url()).not.toContain('/login');
  }, 30_000);

  test('an expired session escalates as a critical intervention', async () => {
    await page.goto(`${baseUrl()}/logout`);
    const capability = makeSearchCapability(baseUrl());

    const registry = new SessionRegistry();
    registry.create('s1');
    registry.startRun('s1', 'run-1', capability.capabilityId);

    const { intervention } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '77777' },
      session: { registry, sessionId: 's1' },
    });

    expect(intervention).toBeDefined();
    expect(intervention!.failureCode).toBe('session_expired');
    expect(intervention!.severity).toBe('critical');
    expect(registry.get('s1').state).toBe('paused');
  }, 30_000);

  test('a run that never got past login is not blamed on the session', async () => {
    await page.goto(`${baseUrl()}/logout`);
    const capability = makeSearchCapability(baseUrl());

    // Fails on the login page itself, where a password field is expected.
    const { runLog } = await execute({
      capability: {
        ...capability,
        steps: [
          capability.steps[0]!,
          {
            stepId: 'click-absent-control',
            risk: 'reversible',
            action: {
              actionType: 'click',
              target: [{ strategy: 'css', selector: '#no-such-control' }],
            },
          },
        ],
        checkpoints: [],
      },
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('locator_not_found');
    }
  }, 30_000);

  test('an ordinary failure past login keeps its own cause', async () => {
    await page.goto(`${baseUrl()}/logout`);
    const capability = makeSearchCapability(baseUrl());

    const { runLog } = await execute({
      capability: {
        ...capability,
        steps: [
          ...capability.steps.slice(0, 4),
          {
            stepId: 'click-absent-control',
            risk: 'reversible',
            action: {
              actionType: 'click',
              target: [{ strategy: 'css', selector: '#no-such-control' }],
            },
          },
        ],
        checkpoints: [],
      },
      surface,
      inputs: { memberNumber: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('locator_not_found');
    }
  }, 30_000);

  test('a business outcome is not reclassified as an expired session', async () => {
    await page.goto(`${baseUrl()}/logout`);
    const capability = makeSearchCapability(baseUrl());

    const { runLog } = await execute({
      capability: {
        ...capability,
        businessOutcomes: [
          {
            code: 'MEMBER_NOT_FOUND',
            message: 'No member matches that number',
            signal: { assert: 'text_present', text: 'No records matched' },
            condition: { when: 'checkpoint_failed', checkpointId: 'results-shown' },
          },
        ],
        expectedDialogs: [],
        interstitials: [],
      },
      surface,
      inputs: { memberNumber: '99999' },
    });

    expect(runLog.outcome?.classification).toBe('business_outcome');
  }, 30_000);
});

describe('Hand back and resume', () => {
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

  async function signIn(capability: Capability) {
    await page.goto(`${BASE_URL}/logout`);
    await execute({
      capability: { ...capability, steps: capability.steps.slice(0, 4) },
      surface,
      inputs: { memberNumber: '12345' },
    });
  }

  test('gate holds when the operator left the page where replay expects it', async () => {
    const capability = makeGuardedCapability(BASE_URL);
    await signIn(capability);

    const gate = await reassert(capability, surface, 'fill-member-number');
    expect(gate.held).toBe(true);
  }, 30_000);

  test('gate fails when the operator navigated away', async () => {
    const capability = makeGuardedCapability(BASE_URL);
    await signIn(capability);
    await page.goto(`${BASE_URL}/logout`);

    const gate = await reassert(capability, surface, 'fill-member-number');
    expect(gate.held).toBe(false);
    if (!gate.held) {
      expect(gate.checkpointId).toBe('on-search-page');
      expect(gate.reason).toContain('no longer holds');
    }
  }, 30_000);

  test('gate holds trivially when resuming at the first step', async () => {
    const capability = makeGuardedCapability(BASE_URL);
    const gate = await reassert(capability, surface, 'navigate-to-login');
    expect(gate.held).toBe(true);
  }, 30_000);

  test('gate fails for a step that is not in the capability', async () => {
    const capability = makeGuardedCapability(BASE_URL);
    const gate = await reassert(capability, surface, 'no-such-step');
    expect(gate.held).toBe(false);
    if (!gate.held) expect(gate.reason).toContain('not part of this capability');
  }, 30_000);

  test('resumes from the failed step and completes the run', async () => {
    const capability = makeGuardedCapability(BASE_URL);
    await signIn(capability);

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
      resumeAtStepId: 'fill-member-number',
    });

    expect(runLog.outcome?.classification).toBe('success');

    // Only the two remaining steps replayed; the sign-in steps were not redone.
    const actionEntries = runLog.entries.filter((e) => e.entryType === 'action');
    expect(actionEntries.map((e) => e.entryType === 'action' && e.stepId)).toEqual([
      'fill-member-number',
      'click-search',
    ]);
  }, 30_000);

  test('a failed gate blocks the replay and raises a fresh intervention', async () => {
    const capability = makeGuardedCapability(BASE_URL);
    await signIn(capability);
    await page.goto(`${BASE_URL}/logout`);

    const registry = new SessionRegistry();
    registry.create('s1');
    registry.startRun('s1', 'run-1', capability.capabilityId);

    const { runLog, intervention } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
      resumeAtStepId: 'fill-member-number',
      session: { registry, sessionId: 's1' },
    });

    expect(runLog.entries.filter((e) => e.entryType === 'action')).toHaveLength(0);
    expect(runLog.outcome?.classification).toBe('failed');
    expect(intervention).toBeDefined();
    expect(intervention!.failureCode).toBe('assertion_failed');
    expect(registry.get('s1').state).toBe('paused');
  }, 30_000);

  test('full cycle: intervention, operator takeover, hand back, resume, complete', async () => {
    const capability = makeGuardedCapability(BASE_URL);
    const registry = new SessionRegistry();
    registry.create('s1');

    // The run is interrupted before the search step and escalated.
    await signIn(capability);
    registry.startRun('s1', 'run-1', capability.capabilityId);
    const { intervention } = await execute({
      capability: {
        ...capability,
        checkpoints: [
          {
            checkpointId: 'never-holds',
            afterStepId: 'fill-member-number',
            allOf: [{ assert: 'text_present', text: 'THIS TEXT IS NOT ON THE PAGE' }],
          },
        ],
      },
      surface,
      inputs: { memberNumber: '12345' },
      resumeAtStepId: 'fill-member-number',
      session: { registry, sessionId: 's1' },
    });

    expect(intervention).toBeDefined();
    expect(registry.get('s1').state).toBe('paused');

    // An operator drives the same live session, then hands it back.
    handOff(registry, 's1', 'op-jane');
    expect(registry.get('s1').controlToken.heldBy).toBe('operator');
    await page.goto(`${BASE_URL}/members/search`);

    handBack(registry, 's1', 'op-jane');
    resolveIntervention(registry, 's1');
    expect(registry.get('s1').state).toBe('running');

    // The run resumes against the page the operator left behind.
    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNumber: '12345' },
      resumeAtStepId: 'fill-member-number',
      session: { registry, sessionId: 's1' },
    });

    expect(runLog.outcome?.classification).toBe('success');

    registry.completeRun('s1');
    const session = registry.get('s1');
    expect(session.state).toBe('idle');
    expect(session.interventions[0]!.state).toBe('resolved');
  }, 60_000);
});
