import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve, dirname } from 'node:path';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(thisFile), '..', '..', '..');
const PORT = 4329;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const OPERATOR_PASSWORD = 'correct-horse-battery-staple';
const MEMBER_NUMBER = '12345';

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

function runCli(args: string[]): Promise<number> {
  return new Promise((resolveExit) => {
    const child = spawn(resolve(repoRoot, 'node_modules/.bin/tsx'), args, {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    child.on('close', (code) => resolveExit(code ?? 1));
  });
}

/**
 * The redaction unit tests prove the scrubber works on a run log it is handed.
 * This one proves the replay path actually hands it one — the guarantee is about
 * what reaches the disk, and for a while this path wrote the password out in
 * full while the discovery path did not.
 */
describe('Credentials on the replay path', () => {
  let targetApp: ChildProcess;
  let outputDirectory: string;
  let runLogText: string;

  beforeAll(async () => {
    targetApp = spawn(
      resolve(repoRoot, 'node_modules/.bin/tsx'),
      ['apps/target-app/src/index.ts'],
      { env: { ...process.env, TARGET_APP_PORT: String(PORT) }, cwd: repoRoot, stdio: 'pipe' },
    );

    await waitForHealth(`${BASE_URL}/health`);

    outputDirectory = await mkdtemp(join(tmpdir(), 'understudy-redaction-'));

    // The shipped artifact points at port 4000; this rewrites only the origin so
    // the test drives its own instance.
    const artifactPath = resolve(
      repoRoot,
      'packages/schemas/examples/lookup-savings-balance.capability.json',
    );
    const artifact = (await readFile(artifactPath, 'utf-8')).replaceAll(
      'http://localhost:4000',
      BASE_URL,
    );
    const localArtifactPath = join(outputDirectory, 'capability.json');
    await writeFile(localArtifactPath, artifact, 'utf-8');

    const runLogPath = join(outputDirectory, 'runlog.json');

    await runCli([
      'apps/cli/src/replay.ts',
      localArtifactPath,
      '--input',
      `memberNumber=${MEMBER_NUMBER}`,
      '--input',
      'operatorUserId=tester',
      '--input',
      `operatorPassword=${OPERATOR_PASSWORD}`,
      '--output',
      runLogPath,
    ]);

    runLogText = await readFile(runLogPath, 'utf-8');
  }, 90_000);

  afterAll(() => {
    targetApp?.kill();
  });

  test('the run reached the member and returned outputs', () => {
    const runLog = JSON.parse(runLogText);
    expect(runLog.outcome.classification).toBe('success');
    expect(runLog.outcome.outputs.savingsBalance).toBe(4182.9);
  });

  test('the password appears nowhere in the written run log', () => {
    expect(runLogText).not.toContain(OPERATOR_PASSWORD);
    expect(runLogText).toContain('[redacted]');
  });

  test('the secret is redacted in the inputs and in the step that used it', () => {
    const runLog = JSON.parse(runLogText);

    expect(runLog.inputs.operatorPassword).toBe('[redacted]');

    const fills = runLog.entries.filter(
      (entry: { entryType: string; action?: { actionType: string } }) =>
        entry.entryType === 'action' && entry.action?.actionType === 'fill',
    );
    const values = fills.map((entry: { action: { value: string } }) => entry.action.value);

    expect(values).toContain('[redacted]');
    expect(values).not.toContain(OPERATOR_PASSWORD);
  });

  test('screenshots were written alongside the log', async () => {
    const files = await readdir(join(outputDirectory, 'screenshots'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((name) => name.endsWith('.png'))).toBe(true);
  });
});
