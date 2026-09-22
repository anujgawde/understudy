import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import type { Policy } from '@understudy/schemas';
import { Capability } from '@understudy/schemas';
import { PlaywrightSurface } from '@understudy/surface';
import { execute } from '@understudy/replay';
import { SessionRegistry } from '@understudy/session';
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
      'approve-irreversible': { type: 'boolean', default: false },
    },
  });

  const artifactPath = positionals[0];
  if (!artifactPath) {
    console.error(
      'Usage: replay <artifact.json> [--input key=value ...] [--headed] [--output path] ' +
        '[--approve-irreversible]',
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
    approveIrreversible: values['approve-irreversible'] ?? false,
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

  // Named explicitly, so this runs — but a draft is an artifact nothing has
  // verified, and the operator should know that before reading its output.
  if (capability.status !== 'approved') {
    console.error(
      `Note: "${capability.capabilityId}" is a draft — nothing has replayed it successfully ` +
        'since it was recorded. Running it because you named it.',
    );
  }

  // Paced only when headed: a local replay otherwise finishes faster than a person can follow.
  const browser = await chromium.launch({
    headless: !args.headed,
    slowMo: args.headed ? 500 : 0,
  });
  const page = await browser.newPage();
  const redactionPolicy = redactionPolicyFor(capability);
  const surface = new PlaywrightSurface(page, {
    redactedFieldNames: redactionPolicy.redactedFieldNames,
  });

  try {
    const runId = crypto.randomUUID();

    // A replay is a session, even when nobody is watching it. Without one the
    // executor has nowhere to raise an intervention, so this path could never
    // escalate — the escalation machinery existed and the main replay command
    // was the one caller that could not reach it.
    const registry = new SessionRegistry();
    const sessionId = `replay-${runId}`;
    registry.create(sessionId);
    registry.startRun(sessionId, runId, capability.capabilityId);

    // Replay never observes — that is the point of it — so nothing photographs
    // the page on its own. Each recorded entry is one, taken while the page is
    // still in the state that produced it.
    const frames: Buffer[] = [];
    let failureFrame: Buffer | undefined;
    const { runLog: recordedRunLog, intervention } = await execute({
      capability,
      surface,
      inputs: args.inputs,
      runId,
      session: { registry, sessionId },
      approveIrreversible: args.approveIrreversible,
      // Held in memory: the run directory is named after the outcome, which is
      // not known until the run ends. Recorded as a bare filename rather than
      // an absolute path so a copied evidence folder still resolves.
      captureFailureFrame: async () => {
        failureFrame = await surface.screenshot();
        return 'intervention.png';
      },
      async onEntry(entry) {
        if (entry.entryType !== 'action' && entry.entryType !== 'assertion') return;
        frames.push(await surface.screenshot());
      },
    });

    // Never write a credential to disk. discover.ts has always done this; this
    // path did not, and a real replay of the member lookup saved the password
    // as readable text.
    const runLog = redactRunLog(recordedRunLog, redactionPolicy);
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

    // The policy that actually governed this run, written beside it. A policy
    // described in a document is a claim; one saved next to the run it shaped
    // is the record of what was in force at the time.
    await writeFile(
      join(runDirectory, 'policy.json'),
      JSON.stringify(redactionPolicy, null, 2) + '\n',
      'utf-8',
    );

    // An intervention is the system reporting that it stopped and why. Leaving
    // it in memory meant the escalation path produced its most useful artifact
    // and then dropped it on the floor.
    if (intervention) {
      if (failureFrame) {
        await writeFile(join(runDirectory, 'intervention.png'), failureFrame);
      }
      await writeFile(
        join(runDirectory, 'intervention.json'),
        JSON.stringify(intervention, null, 2) + '\n',
        'utf-8',
      );
      console.error(`Intervention: ${join(runDirectory, 'intervention.json')}`);
    }
    await syncRunLog(runLog);
    console.error(`Outcome: ${outcome}`);
    console.error(`Run log: ${runLogPath}`);
    console.error(`Screenshots: ${frames.length}`);

    console.log(json);

    // A recovered run reached its outputs; from the caller's side that is a
    // success that had to work for it, not a failure.
    const classification = runLog.outcome?.classification;
    const exitCode = classification === 'success' || classification === 'recovered' ? 0 : 1;
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
