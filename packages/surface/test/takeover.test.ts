import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import type { ScreencastFrame } from '@understudy/schemas';
import { OperatorTakeover } from '../src/takeover.js';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), '..', '..', '..');
const PORT = 4328;
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

async function waitForFrames(frames: ScreencastFrame[], count: number, timeoutMs = 10_000) {
  const start = Date.now();
  while (frames.length < count && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('OperatorTakeover', () => {
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

  test('streams base64 JPEG frames of the live page', async () => {
    await page.goto(`${BASE_URL}/login`);
    const takeover = new OperatorTakeover(page);
    const frames: ScreencastFrame[] = [];

    await takeover.startScreencast((frame) => frames.push(frame));
    await page.mouse.move(10, 10);
    await waitForFrames(frames, 1);
    await takeover.stopScreencast();

    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0]!.data.length).toBeGreaterThan(0);
    expect(Buffer.from(frames[0]!.data, 'base64').subarray(0, 2)).toEqual(
      Buffer.from([0xff, 0xd8]),
    );
    expect(() => new Date(frames[0]!.capturedAt).toISOString()).not.toThrow();
  }, 30_000);

  test('keeps acking so frames continue past the first', async () => {
    await page.goto(`${BASE_URL}/login`);
    const takeover = new OperatorTakeover(page);
    const frames: ScreencastFrame[] = [];

    await takeover.startScreencast((frame) => frames.push(frame));

    // CDP only emits a frame when the page actually repaints, so the stream has
    // to be driven by visible change rather than by cursor movement alone.
    const userIdInput = page.locator('input[type="text"]').first();
    await userIdInput.focus();
    for (const chunk of ['one', 'two', 'three', 'four']) {
      await userIdInput.fill(chunk);
      await page.waitForTimeout(250);
    }

    await waitForFrames(frames, 2);
    await takeover.stopScreencast();

    expect(frames.length).toBeGreaterThan(1);
  }, 30_000);

  test('starting twice throws', async () => {
    await page.goto(`${BASE_URL}/login`);
    const takeover = new OperatorTakeover(page);

    await takeover.startScreencast(() => {});
    await expect(takeover.startScreencast(() => {})).rejects.toThrow('already running');
    await takeover.stopScreencast();
  }, 30_000);

  test('stopping without starting is a no-op', async () => {
    const takeover = new OperatorTakeover(page);
    await expect(takeover.stopScreencast()).resolves.toBeUndefined();
  }, 30_000);

  test('can restart after stopping', async () => {
    await page.goto(`${BASE_URL}/login`);
    const takeover = new OperatorTakeover(page);

    await takeover.startScreencast(() => {});
    await takeover.stopScreencast();
    await expect(takeover.startScreencast(() => {})).resolves.toBeUndefined();
    await takeover.stopScreencast();
  }, 30_000);

  test('forwards typing and clicks into the same page', async () => {
    await page.goto(`${BASE_URL}/login`);
    const takeover = new OperatorTakeover(page);

    const userIdInput = page.locator('input[type="text"]').first();
    const box = await userIdInput.boundingBox();
    expect(box).not.toBeNull();

    await takeover.dispatch({
      inputType: 'mouse_click',
      x: box!.x + box!.width / 2,
      y: box!.y + box!.height / 2,
      button: 'left',
      clickCount: 1,
    });
    await takeover.dispatch({ inputType: 'type_text', text: 'operator-was-here' });

    expect(await userIdInput.inputValue()).toBe('operator-was-here');
  }, 30_000);

  test('forwards key presses', async () => {
    await page.goto(`${BASE_URL}/login`);
    const takeover = new OperatorTakeover(page);

    const userIdInput = page.locator('input[type="text"]').first();
    await userIdInput.fill('abc');
    await userIdInput.focus();

    await takeover.dispatch({ inputType: 'key_press', key: 'Backspace' });

    expect(await userIdInput.inputValue()).toBe('ab');
  }, 30_000);

  test('operator input lands in the same context the run was using', async () => {
    await page.goto(`${BASE_URL}/login`);
    const takeover = new OperatorTakeover(page);

    await takeover.dispatch({ inputType: 'mouse_move', x: 5, y: 5 });
    await takeover.dispatch({ inputType: 'scroll', x: 5, y: 5, deltaX: 0, deltaY: 100 });

    // Same page object the surface would be driving — no second tab or context.
    expect(page.url()).toContain('/login');
    expect(browser.contexts()).toHaveLength(1);
  }, 30_000);
});
