import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { markRedactedElements } from '../src/masking.js';
import { PlaywrightSurface } from '../src/playwright-surface.js';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), '..', '..', '..');
const PORT = 4328;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const MASK_ATTRIBUTE = 'data-understudy-mask';

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

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('#ctl00_ContentMain_txtUserID').fill('tester');
  await page.locator('#ctl00_ContentMain_txtPassword').fill('hunter2');
  await page.locator('#ctl00_ContentMain_btnLogin').click();
  await page.waitForLoadState('load');
}

/**
 * Redaction everywhere else works on strings on their way to disk. A screenshot
 * carries the same values as pixels, so these cover the one boundary a string
 * filter cannot reach.
 */
describe('Screenshot masking', () => {
  let targetApp: ChildProcess;
  let browser: Browser;
  let page: Page;

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
  }, 30_000);

  afterAll(async () => {
    await page?.close();
    await browser?.close();
    targetApp?.kill();
  });

  test('a password field is masked even when no policy names it', async () => {
    await page.goto(`${BASE_URL}/logout`);
    await page.goto(`${BASE_URL}/login`);

    const marked = await page.evaluate(markRedactedElements, {
      fieldNames: [],
      attribute: MASK_ATTRIBUTE,
    });

    expect(marked).toBe(true);
    expect(await page.locator(`#ctl00_ContentMain_txtPassword[${MASK_ATTRIBUTE}]`).count()).toBe(1);
    expect(await page.locator(`#ctl00_ContentMain_txtUserID[${MASK_ATTRIBUTE}]`).count()).toBe(0);
  });

  test('PII in a detail table is masked by the label beside it', async () => {
    await signIn(page);
    await page.locator('#ctl00_ContentMain_txtMbrNo').fill('12345');
    await page.locator('#ctl00_ContentMain_btnSearch').click();
    await page.waitForLoadState('load');
    await page.locator('#ctl00_ContentMain_grdResults tbody a').first().click();
    await page.waitForLoadState('load');

    const marked = await page.evaluate(markRedactedElements, {
      fieldNames: ['ssn', 'dob'],
      attribute: MASK_ATTRIBUTE,
    });

    expect(marked).toBe(true);

    // The label cell says "SSN:" and the value sits in the cell after it, which
    // is how these screens are built and why matching the label alone is not
    // enough.
    const maskedText = await page
      .locator(`td[${MASK_ATTRIBUTE}]`)
      .allTextContents();

    expect(maskedText.some((text) => text.includes('***-**-'))).toBe(true);
    expect(maskedText.some((text) => text.includes('03/15/1968'))).toBe(true);

    // The member's name is on the same table and was not asked for, so it stays
    // readable — a mask that covered everything would make the evidence useless.
    expect(maskedText.some((text) => text.includes('JOHNSON'))).toBe(false);
  });

  test('a page with nothing to mask reports so rather than masking blindly', async () => {
    await page.goto(`${BASE_URL}/health`);

    const marked = await page.evaluate(markRedactedElements, {
      fieldNames: ['ssn'],
      attribute: MASK_ATTRIBUTE,
    });

    expect(marked).toBe(false);
  });

  test('the surface screenshots through the mask', async () => {
    // An earlier test signed in, and /login redirects a signed-in session
    // straight past the form this one needs.
    await page.goto(`${BASE_URL}/logout`);
    await page.goto(`${BASE_URL}/login`);
    const surface = new PlaywrightSurface(page, { redactedFieldNames: ['password'] });

    const frame = await surface.screenshot();

    expect(frame.byteLength).toBeGreaterThan(0);
    // The marking pass ran against the live page, which is what the mask
    // locator resolves against at capture time.
    expect(await page.locator(`[${MASK_ATTRIBUTE}]`).count()).toBeGreaterThan(0);
  });
});
