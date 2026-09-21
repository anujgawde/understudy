import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, dirname } from 'node:path';
import { Observation } from '@understudy/schemas';
import { PlaywrightSurface } from '../src/playwright-surface.js';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), '..', '..', '..');
const PORT = 4321;
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

describe('PlaywrightSurface.observe', () => {
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

  test('login page — finds textboxes, combobox, and buttons', async () => {
    await page.goto(`${BASE_URL}/login`);
    const observation = await surface.observe();

    expect(observation.url).toContain('/login');
    expect(observation.pageTitle).toContain('Meridian Core');
    expect(observation.capturedAt).toBeTruthy();

    const textboxes = observation.elements.filter((el) => el.role === 'textbox');
    expect(textboxes.length).toBeGreaterThanOrEqual(2);

    const userId = textboxes.find((el) => el.domId === 'ctl00_ContentMain_txtUserID');
    expect(userId).toBeDefined();
    expect(userId!.isEnabled).toBe(true);
    expect(userId!.isVisible).toBe(true);
    expect(userId!.tagName).toBe('input');

    const password = textboxes.find((el) => el.domId === 'ctl00_ContentMain_txtPassword');
    expect(password).toBeDefined();

    const comboboxes = observation.elements.filter((el) => el.role === 'combobox');
    expect(comboboxes.length).toBeGreaterThanOrEqual(1);
    const branchSelect = comboboxes.find((el) => el.domId === 'ctl00_ContentMain_ddlBranch');
    expect(branchSelect).toBeDefined();
    expect(branchSelect!.currentValue).toBe('MAIN');

    const buttons = observation.elements.filter((el) => el.role === 'button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    const signInButton = buttons.find((el) => el.accessibleName === 'Sign In');
    expect(signInButton).toBeDefined();

    Observation.parse(observation);
  });

  test('login page — nearbyText captures label cells', async () => {
    await page.goto(`${BASE_URL}/login`);
    const observation = await surface.observe();

    const userId = observation.elements.find(
      (el) => el.domId === 'ctl00_ContentMain_txtUserID',
    );
    expect(userId).toBeDefined();
    expect(userId!.nearbyText).toBeDefined();
    expect(userId!.nearbyText!.some((text) => text.includes('User ID'))).toBe(true);
  });

  test('search page — finds search form elements', async () => {
    await login();

    const observation = await surface.observe();
    expect(observation.url).toContain('/members/search');

    const memberNumberInput = observation.elements.find(
      (el) => el.domId === 'ctl00_ContentMain_txtMbrNo',
    );
    expect(memberNumberInput).toBeDefined();
    expect(memberNumberInput!.role).toBe('textbox');

    const searchButton = observation.elements.find(
      (el) => el.accessibleName === 'Search' && el.role === 'button',
    );
    expect(searchButton).toBeDefined();
    expect(searchButton!.domId).toBe('ctl00_ContentMain_btnSearch');

    const navLinks = observation.elements.filter((el) => el.role === 'link');
    expect(navLinks.length).toBeGreaterThan(0);

    Observation.parse(observation);
  });

  test('search results — finds table cells with column headers in nearbyText', { timeout: 15_000 }, async () => {
    await login();

    await page.fill('#ctl00_ContentMain_txtMbrNo', '12345');
    await Promise.all([
      page.waitForLoadState('load'),
      page.click('#ctl00_ContentMain_btnSearch'),
    ]);

    const observation = await surface.observe();

    const cells = observation.elements.filter((el) => el.role === 'cell');
    expect(cells.length).toBeGreaterThan(0);

    const columnHeaders = observation.elements.filter((el) => el.role === 'columnheader');
    expect(columnHeaders.length).toBeGreaterThan(0);
    expect(columnHeaders.some((el) => el.accessibleName === 'Member No')).toBe(true);

    Observation.parse(observation);
  });

  test('member detail — finds share summary cells', { timeout: 15_000 }, async () => {
    await login();

    await page.fill('#ctl00_ContentMain_txtMbrNo', '12345');
    await Promise.all([
      page.waitForLoadState('load'),
      page.click('#ctl00_ContentMain_btnSearch'),
    ]);

    await Promise.all([
      page.waitForLoadState('load'),
      page.click('#ctl00_ContentMain_grdResults a'),
    ]);

    const observation = await surface.observe();
    expect(observation.url).toContain('/members/detail');

    const shareHeaders = observation.elements.filter(
      (el) =>
        el.role === 'columnheader' &&
        el.accessibleName &&
        ['Share ID', 'Description', 'Current Balance', 'Available', 'Status'].includes(
          el.accessibleName,
        ),
    );
    expect(shareHeaders.length).toBeGreaterThanOrEqual(4);

    const shareCells = observation.elements.filter(
      (el) => el.role === 'cell' && el.nearbyText?.some((text) => text.includes('Current Balance')),
    );
    expect(shareCells.length).toBeGreaterThan(0);

    const emDashCell = observation.elements.find(
      (el) => el.role === 'cell' && el.accessibleName === '—',
    );
    expect(emDashCell).toBeDefined();

    Observation.parse(observation);
  });

  test('elementRef attributes are stamped on the DOM', async () => {
    await page.goto(`${BASE_URL}/login`);
    await surface.observe();

    const stampedCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-understudy-ref]').length;
    });
    expect(stampedCount).toBeGreaterThan(0);

    const firstRef = await page.evaluate(() => {
      return document.querySelector('[data-understudy-ref]')?.getAttribute('data-understudy-ref');
    });
    expect(firstRef).toMatch(/^element-\d+$/);
  });

  test('previous refs are cleared on re-observe', async () => {
    await page.goto(`${BASE_URL}/login`);

    const first = await surface.observe();
    const second = await surface.observe();

    const stampedCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-understudy-ref]').length;
    });

    expect(stampedCount).toBe(second.elements.length);
    expect(first.elements[0]!.elementRef).toBe(second.elements[0]!.elementRef);
  });

  test('screenshots are numbered in observation order', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'understudy-screenshots-'));
    const capturing = new PlaywrightSurface(page, { screenshotDirectory: directory });
    await page.goto(`${BASE_URL}/login`);

    const first = await capturing.observe();
    const second = await capturing.observe();

    expect(basename(first.screenshotPath!)).toBe('observe-000.png');
    expect(basename(second.screenshotPath!)).toBe('observe-001.png');

    // The name used to be Date.now(), and 13 consecutive digits is what the
    // payment-card pattern in the policy looks for, so redaction rewrote every
    // screenshot path in the run log into one that resolves to nothing.
    expect(basename(second.screenshotPath!)).not.toMatch(/\d(?:[ -]?\d){12,18}/);
  });
});
