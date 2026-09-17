import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { PlaywrightSurface } from '../src/playwright-surface.js';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), '..', '..', '..');
const PORT = 4323;
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

describe('PlaywrightSurface.resolve', () => {
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

  test('first rung wins — returns rungIndex 0', async () => {
    await page.goto(`${BASE_URL}/login`);

    const result = await surface.resolve([
      { strategy: 'css', selector: '#ctl00_ContentMain_txtUserID' },
    ]);

    expect(result.rungIndex).toBe(0);
    expect(result.rung.strategy).toBe('css');
    expect(result.matchCount).toBe(1);
  });

  test('falls through to second rung — returns rungIndex 1', async () => {
    await page.goto(`${BASE_URL}/login`);

    const result = await surface.resolve([
      { strategy: 'role', role: 'textbox', accessibleName: 'Nonexistent Field' },
      { strategy: 'css', selector: '#ctl00_ContentMain_txtUserID' },
    ]);

    expect(result.rungIndex).toBe(1);
    expect(result.rung.strategy).toBe('css');
    expect(result.matchCount).toBe(1);
  });

  test('adjacent locator resolves and reports match', async () => {
    await page.goto(`${BASE_URL}/login`);

    const result = await surface.resolve([
      { strategy: 'adjacent', labelText: 'User ID', direction: 'next' },
    ]);

    expect(result.rungIndex).toBe(0);
    expect(result.rung.strategy).toBe('adjacent');
    expect(result.matchCount).toBe(1);
  });

  test('matchCount reflects multiple matching elements', async () => {
    await page.goto(`${BASE_URL}/login`);

    const result = await surface.resolve([
      { strategy: 'role', role: 'textbox' },
    ]);

    expect(result.rungIndex).toBe(0);
    expect(result.rung.strategy).toBe('role');
    expect(result.matchCount).toBeGreaterThan(1);
  });

  test('unresolvable ladder throws descriptive error', async () => {
    await page.goto(`${BASE_URL}/login`);

    await expect(
      surface.resolve([
        { strategy: 'css', selector: '#does_not_exist' },
        { strategy: 'role', role: 'button', accessibleName: 'Nonexistent' },
      ]),
    ).rejects.toThrow(/No rung in the locator ladder matched/);
  });
});
