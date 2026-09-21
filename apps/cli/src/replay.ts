import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import type { Policy } from '@understudy/schemas';
import { Capability } from '@understudy/schemas';
import { PlaywrightSurface } from '@understudy/surface';
import { execute } from '@understudy/replay';
import { redactRunLog } from '@understudy/redaction';
import { defaultPolicy } from './policy.js';
import { syncRunLog } from './server-sync.js';

function parseCliArguments() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: 'string', short: 'i', multiple: true, default: [] },
      headed: { type: 'boolean', default: false },
      output: { type: 'string', short: 'o' },
    },
  });

  const artifactPath = positionals[0];
  if (!artifactPath) {
    console.error(
      'Usage: replay <artifact.json> [--input key=value ...] [--headed] [--output path]',
    );
    process.exit(1);
  }

  const inputs: Record<string, string> = {};
  for (const raw of values.input ?? []) {
    const equalsIndex = raw.indexOf('=');
    if (equalsIndex === -1) {
      console.error(`Invalid --input format: "${raw}" (expected key=value)`);
      process.exit(1);
    }
    inputs[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
  }

  return {
    artifactPath,
    inputs,
    headed: values.headed ?? false,
    outputPath: values.output,
  };
}

async function loadCapability(path: string): Promise<Capability> {
  const raw = await readFile(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`Failed to parse JSON from ${path}`);
    process.exit(1);
  }

  const result = Capability.safeParse(parsed);
  if (!result.success) {
    console.error('Capability validation failed:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

/**
 * Replay does not enforce a policy — the artifact already decided what it does.
 * This exists only so the run log is scrubbed on the way out, and it is built
 * from the capability rather than from a target URL: the artifact names its own
 * secrets, which is a better signal than a generic list of field names that has
 * never seen this flow.
 */
function redactionPolicyFor(capability: Capability): Policy {
  // The origin is irrelevant here — nothing on this path enforces an allowlist,
  // and a navigate step's URL can carry a {{placeholder}} that would not parse.
  const base = defaultPolicy('http://localhost', capability.steps.length);

  return {
    ...base,
    redactedFieldNames: [
      ...base.redactedFieldNames,
      ...capability.inputs.filter((input) => input.secret).map((input) => input.name),
    ],
  };
}

async function main(): Promise<void> {
  const args = parseCliArguments();
  const capability = await loadCapability(args.artifactPath);

  const missingInputs = capability.inputs
    .filter((input) => input.required && !(input.name in args.inputs))
    .map((input) => input.name);

  if (missingInputs.length > 0) {
    console.error(`Missing required inputs: ${missingInputs.join(', ')}`);
    process.exit(1);
  }

  // Paced only when headed: a local replay otherwise finishes faster than a person can follow.
  const browser = await chromium.launch({
    headless: !args.headed,
    slowMo: args.headed ? 500 : 0,
  });
  const page = await browser.newPage();
  const surface = new PlaywrightSurface(page);

  try {
    const runId = crypto.randomUUID();

    // Replay never observes — that is the point of it — so nothing photographs
    // the page on its own. Each recorded entry is one, taken while the page is
    // still in the state that produced it.
    const frames: Buffer[] = [];
    const { runLog: recordedRunLog } = await execute({
      capability,
      surface,
      inputs: args.inputs,
      runId,
      async onEntry(entry) {
        if (entry.entryType !== 'action' && entry.entryType !== 'assertion') return;
        frames.push(await page.screenshot({ fullPage: true }));
      },
    });

    // Never write a credential to disk. discover.ts has always done this; this
    // path did not, and a real replay of the member lookup saved the password
    // as readable text.
    const runLog = redactRunLog(recordedRunLog, redactionPolicyFor(capability));
    const json = JSON.stringify(runLog, null, 2);

    // Filed under the outcome so a curated evidence folder shows a success, a
    // business outcome and a failure sitting beside each other.
    const outcome = runLog.outcome?.classification ?? 'unknown';
    const runDirectory =
      args.outputPath !== undefined
        ? dirname(args.outputPath)
        : join(dirname(args.artifactPath), 'replays', outcome, runId);

    await mkdir(join(runDirectory, 'screenshots'), { recursive: true });
    await Promise.all(
      frames.map((frame, index) =>
        writeFile(
          join(runDirectory, 'screenshots', `step-${String(index + 1).padStart(2, '0')}.png`),
          frame,
        ),
      ),
    );

    const runLogPath = args.outputPath ?? join(runDirectory, 'runlog.json');
    await writeFile(runLogPath, json + '\n', 'utf-8');
    await syncRunLog(runLog);
    console.error(`Outcome: ${outcome}`);
    console.error(`Run log: ${runLogPath}`);
    console.error(`Screenshots: ${frames.length}`);

    console.log(json);

    const exitCode = runLog.outcome?.classification === 'success' ? 0 : 1;
    process.exit(exitCode);
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
