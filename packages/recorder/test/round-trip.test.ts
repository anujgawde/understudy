import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import type { Action, Observation, RunLog, RunLogEntry } from '@understudy/schemas';
import { PlaywrightSurface } from '@understudy/surface';
import { execute } from '@understudy/replay';
import { recordCapability } from '../src/record.js';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), '..', '..', '..');
const port = 4325;
const baseUrl = `http://127.0.0.1:${port}`;
const goal = 'Look up member 12345 and read their current balance';

async function waitForHealth(url: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 200));
  }
  throw new Error(`Target app did not become healthy at ${url}`);
}

function clicking(elementRef: string): Action {
  return { actionType: 'click', target: [{ strategy: 'css', selector: refSelector(elementRef) }] };
}

function refSelector(elementRef: string): string {
  return `[data-understudy-ref="${elementRef}"]`;
}

/**
 * Replays what the discovery loop does to a page — observe, act, observe again —
 * so the recorder can be exercised on a real trace without paying for a model.
 */
class TraceDriver {
  readonly entries: RunLogEntry[] = [];
  private sequence = 0;
  private latest: Observation | null = null;

  constructor(private readonly surface: PlaywrightSurface) {}

  async observe(): Promise<Observation> {
    const observation = await this.surface.observe();
    this.entries.push({
      entryType: 'observation',
      sequence: this.sequence++,
      occurredAt: new Date().toISOString(),
      actor: 'system',
      observation,
    });
    this.latest = observation;
    return observation;
  }

  refFor(predicate: (element: Observation['elements'][number]) => boolean): string {
    const element = this.latest?.elements.find(predicate);
    if (!element) {
      const seen = this.latest?.elements
        .map((e) => `${e.role}:${e.accessibleName ?? ''}`)
        .join(' | ');
      throw new Error(`No element on the page matched. Saw: ${seen}`);
    }
    return element.elementRef;
  }

  async act(action: Action): Promise<void> {
    await this.surface.act(action, { waitUntil: 'pageLoad' });
    this.entries.push({
      entryType: 'action',
      sequence: this.sequence++,
      occurredAt: new Date().toISOString(),
      actor: 'model',
      action,
      succeeded: true,
    });
    await this.observe();
  }

  async extract(elementRef: string): Promise<string> {
    const { text } = await this.surface.extractText([
      { strategy: 'css', selector: refSelector(elementRef) },
    ]);
    this.entries.push({
      entryType: 'extraction',
      sequence: this.sequence++,
      occurredAt: new Date().toISOString(),
      actor: 'model',
      outputName: elementRef,
      rawValue: text,
      coerced: false,
    });
    return text;
  }

  toRunLog(): RunLog {
    return {
      runId: 'round-trip-run',
      mode: 'discovery',
      goal,
      inputs: {},
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      entries: this.entries,
      outcome: { classification: 'success', outputs: {} },
    };
  }
}

describe('Discovery → recorder → replay round trip', () => {
  let targetApp: ChildProcess;
  let browser: Browser;
  let page: Page;
  let surface: PlaywrightSurface;

  beforeAll(async () => {
    targetApp = spawn(
      resolve(repoRoot, 'node_modules/.bin/tsx'),
      ['apps/target-app/src/index.ts'],
      {
        env: { ...process.env, TARGET_APP_PORT: String(port) },
        cwd: repoRoot,
        stdio: 'pipe',
      },
    );

    await waitForHealth(`${baseUrl}/health`);

    browser = await chromium.launch();
    page = await browser.newPage();
    surface = new PlaywrightSurface(page);
  }, 30_000);

  afterAll(async () => {
    await page?.close();
    await browser?.close();
    targetApp?.kill();
  });

  test("a recorded artifact replays discovery's own path", { timeout: 90_000 }, async () => {
    await page.goto(`${baseUrl}/logout`);

    const driver = new TraceDriver(surface);
    await driver.observe();

    await driver.act({ actionType: 'navigate', url: `${baseUrl}/login` });

    await driver.act({
      actionType: 'fill',
      target: [
        {
          strategy: 'css',
          selector: refSelector(driver.refFor((e) => e.domId?.includes('txtUserID') === true)),
        },
      ],
      value: 'tester',
    });
    await driver.act({
      actionType: 'fill',
      target: [
        {
          strategy: 'css',
          selector: refSelector(
            driver.refFor((e) => e.role === 'textbox' && e.domId?.includes('txtPassword') === true),
          ),
        },
      ],
      value: 'password',
    });
    await driver.act(
      clicking(driver.refFor((e) => e.role === 'button' && e.accessibleName === 'Sign In')),
    );

    await driver.act({
      actionType: 'fill',
      target: [
        {
          strategy: 'css',
          selector: refSelector(
            driver.refFor((e) => e.role === 'textbox' && e.domId?.includes('MbrNo') === true),
          ),
        },
      ],
      value: '12345',
    });
    await driver.act(
      clicking(driver.refFor((e) => e.role === 'button' && e.accessibleName === 'Search')),
    );
    await driver.act(
      clicking(
        driver.refFor((e) => e.role === 'link' && e.accessibleName?.includes('JOHNSON') === true),
      ),
    );

    const balanceRef = driver.refFor(
      (e) => e.role === 'cell' && e.accessibleName?.startsWith('$') === true,
    );
    const recordedBalance = await driver.extract(balanceRef);

    const capability = recordCapability(driver.toRunLog(), {
      capabilityId: 'round-trip-lookup',
      name: 'Round trip lookup',
      modelId: 'trace-driver',
    });

    // Named from the label the page actually shows over that field, "Member No:".
    expect(capability.inputs.map((input) => input.name)).toEqual(['memberNo']);
    expect(capability.outputs).toHaveLength(1);

    await page.goto(`${baseUrl}/logout`);

    const { runLog } = await execute({
      capability,
      surface,
      inputs: { memberNo: '12345' },
    });

    expect(runLog.outcome?.classification).toBe('success');
    if (runLog.outcome?.classification === 'success') {
      expect(Object.values(runLog.outcome.outputs)[0]).toBe(
        Number(recordedBalance.replace(/[$,]/g, '')),
      );
    }
  });
});
