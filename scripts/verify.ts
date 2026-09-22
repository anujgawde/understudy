/**
 * Replays the shipped example artifact against every runtime condition the
 * target app can produce, and checks each one against the outcome it is
 * supposed to report.
 *
 * This exists because the claim this project rests on — that an expired
 * session, a rejected input and an empty result set are three different
 * answers — is not something you can confirm by reading the code. It has to be
 * run. Every scenario writes its log and screenshots into `evidence/`, so the
 * same command that proves the taxonomy also produces the evidence for it.
 *
 * Exits non-zero if any row disagrees, so it can gate a commit.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TARGET_APP_PORT ?? 4000);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const ARTIFACT = 'packages/schemas/examples/lookup-savings-balance.capability.json';
const CAPABILITY_ID = 'lookup-savings-balance';

const OPERATOR_USER_ID = 'tester';
const OPERATOR_PASSWORD = 'verify-run-not-a-real-credential';

interface Scenario {
  memberNumber: string;
  /** Names the directory this run lands in, so evidence reads as itself. */
  name: string;
  classification: string;
  /** The business outcome code, the failure code, or the recovery kind. */
  detail?: string;
}

const SCENARIOS: Scenario[] = [
  { memberNumber: '12345', name: 'member-found', classification: 'success' },
  { memberNumber: '99999', name: 'member-not-found', classification: 'business_outcome', detail: 'member_not_found' },
  { memberNumber: '88888', name: 'validation-rejected', classification: 'business_outcome', detail: 'validation_rejected' },
  { memberNumber: '55555', name: 'access-denied', classification: 'business_outcome', detail: 'access_denied' },
  { memberNumber: '66666', name: 'slow-grid', classification: 'recovered', detail: 'retried_read' },
  { memberNumber: '22222', name: 'maintenance-notice', classification: 'recovered', detail: 'dismissed_interstitial' },
  { memberNumber: '33333', name: 'unexpected-dialog', classification: 'failed', detail: 'unexpected_dialog' },
  { memberNumber: '44444', name: 'app-error', classification: 'failed', detail: 'app_error' },
  { memberNumber: '77777', name: 'session-expired', classification: 'failed', detail: 'session_expired' },
];

async function waitForHealth(timeoutMilliseconds = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMilliseconds) {
    try {
      if ((await fetch(`${BASE_URL}/health`)).ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Target app did not come up on ${BASE_URL}`);
}

function runReplay(scenario: Scenario, outputPath: string): Promise<void> {
  return new Promise((resolveRun) => {
    const child = spawn(
      resolve(repoRoot, 'node_modules/.bin/tsx'),
      [
        'apps/cli/src/replay.ts',
        ARTIFACT,
        '--input', `memberNumber=${scenario.memberNumber}`,
        '--input', `operatorUserId=${OPERATOR_USER_ID}`,
        '--input', `operatorPassword=${OPERATOR_PASSWORD}`,
        '--output', outputPath,
      ],
      { cwd: repoRoot, stdio: 'ignore' },
    );
    child.on('close', () => resolveRun());
  });
}

/** What the run actually reported, flattened to one comparable string. */
function actualDetail(outcome: Record<string, unknown>): string | undefined {
  if (typeof outcome['code'] === 'string') return outcome['code'];
  if (typeof outcome['failureCode'] === 'string') return outcome['failureCode'];

  const recoveries = outcome['recoveries'];
  if (Array.isArray(recoveries) && recoveries.length > 0) {
    return (recoveries[0] as { kind?: string }).kind;
  }
  return undefined;
}

async function main(): Promise<void> {
  const targetApp: ChildProcess = spawn(
    resolve(repoRoot, 'node_modules/.bin/tsx'),
    ['apps/target-app/src/index.ts'],
    { env: { ...process.env, TARGET_APP_PORT: String(PORT) }, cwd: repoRoot, stdio: 'pipe' },
  );

  const rows: Array<{ scenario: Scenario; actual: string; ok: boolean }> = [];

  try {
    await waitForHealth();

    // The brief asks the evidence folder to hold the artifact as well as the
    // runs, and a folder that carries the runs without the thing they replayed
    // cannot be checked by anyone. Copied rather than referenced so the folder
    // stands on its own if it is moved.
    const capabilityDirectory = join(repoRoot, 'evidence', CAPABILITY_ID);
    await mkdir(capabilityDirectory, { recursive: true });
    await copyFile(join(repoRoot, ARTIFACT), join(capabilityDirectory, 'capability.json'));

    for (const scenario of SCENARIOS) {
      // Written to the directory the outcome is *expected* to produce. A run
      // that lands somewhere else is a failing row, so the layout and the
      // assertion cannot drift apart.
      const runDirectory = join(
        repoRoot, 'evidence', CAPABILITY_ID, 'replays', scenario.classification, scenario.name,
      );
      await rm(runDirectory, { recursive: true, force: true });

      const outputPath = join(runDirectory, 'runlog.json');
      await runReplay(scenario, outputPath);

      let actual: string;
      let ok = false;
      try {
        const runLog = JSON.parse(await readFile(outputPath, 'utf-8'));
        const outcome = runLog.outcome ?? {};
        const detail = actualDetail(outcome);
        actual = detail ? `${outcome.classification}/${detail}` : String(outcome.classification);
        ok =
          outcome.classification === scenario.classification &&
          (scenario.detail === undefined || detail === scenario.detail);
      } catch {
        actual = 'no run log written';
      }

      rows.push({ scenario, actual, ok });
    }
  } finally {
    targetApp.kill();
  }

  const expectedWidth = Math.max(
    ...SCENARIOS.map((s) => (s.detail ? `${s.classification}/${s.detail}` : s.classification).length),
  );

  console.log('');
  console.log(
    `${'member'.padEnd(8)}${'expected'.padEnd(expectedWidth + 2)}${'actual'.padEnd(expectedWidth + 2)}`,
  );

  for (const { scenario, actual, ok } of rows) {
    const expected = scenario.detail
      ? `${scenario.classification}/${scenario.detail}`
      : scenario.classification;
    console.log(
      `${scenario.memberNumber.padEnd(8)}${expected.padEnd(expectedWidth + 2)}${actual.padEnd(expectedWidth + 2)}${ok ? 'ok' : 'FAILED'}`,
    );
  }

  const failed = rows.filter((row) => !row.ok);
  console.log('');
  console.log(
    failed.length === 0
      ? `All ${rows.length} runtime conditions reported as expected. Evidence in evidence/${CAPABILITY_ID}/replays/`
      : `${failed.length} of ${rows.length} disagreed.`,
  );

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
