import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { PlaywrightSurface } from '../src/playwright-surface.js';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), '..', '..', '..');
const PORT = 4322;
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

describe('PlaywrightSurface.act', () => {
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

  async function login(): Promise<void> {
    await page.goto(`${BASE_URL}/members/search`);
    if (page.url().includes('/login')) {
      await page.fill('[name="ctl00$ContentMain$txtUserID"]', 'tester');
      await page.fill('[name="ctl00$ContentMain$txtPassword"]', 'password');
      await page.click('#ctl00_ContentMain_btnLogin');
      await page.waitForURL('**/members/search');
    }
    await page.waitForLoadState('load');
  }

  test('navigate — goes to a URL', async () => {
    await surface.act({ actionType: 'navigate', url: `${BASE_URL}/login` });
    expect(page.url()).toContain('/login');
  });

  test('fill with adjacent locator and click with role locator — login flow', { timeout: 15_000 }, async () => {
    await surface.act({ actionType: 'navigate', url: `${BASE_URL}/login` });

    await surface.act({
      actionType: 'fill',
      target: [{ strategy: 'adjacent', labelText: 'User ID', direction: 'next' }],
      value: 'tester',
    });

    await surface.act({
      actionType: 'fill',
      target: [{ strategy: 'adjacent', labelText: 'Password', direction: 'next' }],
      value: 'password',
    });

    await surface.act(
      {
        actionType: 'click',
        target: [{ strategy: 'role', role: 'button', accessibleName: 'Sign In' }],
      },
      { waitUntil: 'pageLoad' },
    );

    expect(page.url()).toContain('/members/search');
  });

  test('fill and click with css locator — search flow', { timeout: 15_000 }, async () => {
    await login();

    await surface.act({
      actionType: 'fill',
      target: [{ strategy: 'css', selector: '#ctl00_ContentMain_txtMbrNo' }],
      value: '12345',
    });

    await surface.act(
      {
        actionType: 'click',
        target: [{ strategy: 'css', selector: '#ctl00_ContentMain_btnSearch' }],
      },
      { waitUntil: 'pageLoad' },
    );

    const observation = await surface.observe();
    expect(observation.elements.some((el) => el.role === 'cell')).toBe(true);
  });

  test('click with text locator — navigate to member detail', { timeout: 15_000 }, async () => {
    await login();

    await surface.act({
      actionType: 'fill',
      target: [{ strategy: 'css', selector: '#ctl00_ContentMain_txtMbrNo' }],
      value: '12345',
    });

    await surface.act(
      {
        actionType: 'click',
        target: [{ strategy: 'css', selector: '#ctl00_ContentMain_btnSearch' }],
      },
      { waitUntil: 'pageLoad' },
    );

    await surface.act(
      {
        actionType: 'click',
        target: [{ strategy: 'text', text: 'JOHNSON, MARGARET A' }],
      },
      { waitUntil: 'pageLoad' },
    );

    expect(page.url()).toContain('/members/detail');
  });

  test('locator ladder falls through to second rung', async () => {
    await page.goto(`${BASE_URL}/logout`);
    await surface.act({ actionType: 'navigate', url: `${BASE_URL}/login` });

    await surface.act({
      actionType: 'fill',
      target: [
        { strategy: 'role', role: 'textbox', accessibleName: 'Nonexistent Field' },
        { strategy: 'css', selector: '#ctl00_ContentMain_txtUserID' },
      ],
      value: 'fallthrough-test',
    });

    const value = await page.inputValue('#ctl00_ContentMain_txtUserID');
    expect(value).toBe('fallthrough-test');
  });

  test('wait condition — selectorPresent', async () => {
    await page.goto(`${BASE_URL}/logout`);
    await surface.act(
      { actionType: 'navigate', url: `${BASE_URL}/login` },
      { waitUntil: 'selectorPresent', selector: '#ctl00_ContentMain_txtUserID' },
    );

    const visible = await page.isVisible('#ctl00_ContentMain_txtUserID');
    expect(visible).toBe(true);
  });

  test('wait condition — textPresent', async () => {
    await page.goto(`${BASE_URL}/logout`);
    await surface.act(
      { actionType: 'navigate', url: `${BASE_URL}/login` },
      { waitUntil: 'textPresent', text: 'Sign In' },
    );

    expect(page.url()).toContain('/login');
  });

  test('unresolvable ladder throws descriptive error', async () => {
    await page.goto(`${BASE_URL}/logout`);
    await surface.act({ actionType: 'navigate', url: `${BASE_URL}/login` });

    await expect(
      surface.act({
        actionType: 'click',
        target: [
          { strategy: 'role', role: 'button', accessibleName: 'Nonexistent Button' },
          { strategy: 'css', selector: '#does_not_exist' },
        ],
      }),
    ).rejects.toThrow(/No rung in the locator ladder matched/);
  });
});
