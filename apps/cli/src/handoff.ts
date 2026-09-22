import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';
import type { Policy } from '@understudy/schemas';
import { Capability } from '@understudy/schemas';
import { OperatorTakeover, PlaywrightSurface } from '@understudy/surface';
import { execute } from '@understudy/replay';
import {
  SessionRegistry,
  handBack,
  handOff,
  operatorHoldsControl,
  recordOperatorInput,
  resolveIntervention,
} from '@understudy/session';
import { redactRunLog } from '@understudy/redaction';
import { defaultPolicy } from './policy.js';
import { syncIntervention, syncRunLog } from './server-sync.js';

/**
 * Drives one escalation all the way through: replay until it gets stuck, hand
 * the live session to a person, let them fix it in the browser, take it back,
 * re-assert, and finish the run.
 *
 * The operator surface here is a terminal prompt and the browser window the run
 * is already using. That is deliberately bare — the brief puts a co-browsing
 * console out of scope and asks instead that the mechanism and the
 * control-transfer model be real. Everything underneath this is: the session
 * state machine, the control token that refuses input at the wrong moment, the
 * ledger, the re-assertion gate. What a console would replace is the prompt,
 * not the machinery.
 */
function parseCliArguments() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: 'string', short: 'i', multiple: true, default: [] },
      output: { type: 'string', short: 'o' },
    },
  });

  const artifactPath = positionals[0];
  if (!artifactPath) {
    console.error('Usage: handoff <artifact.json> [--input key=value ...] [--output path]');
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

  return { artifactPath, inputs, outputPath: values.output };
}

function redactionPolicyFor(capability: Capability): Policy {
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
  const parsed = Capability.safeParse(JSON.parse(await readFile(args.artifactPath, 'utf-8')));
  if (!parsed.success) {
    console.error('Capability validation failed:');
    for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    process.exit(1);
  }
  const capability = parsed.data;

  const runDirectory = args.outputPath
    ? dirname(args.outputPath)
    : join(dirname(args.artifactPath), 'handoff');
  await mkdir(runDirectory, { recursive: true });

  const redactionPolicy = redactionPolicyFor(capability);

  // Headed on purpose: the operator has to be able to see and use the page.
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const page = await browser.newPage();
  const surface = new PlaywrightSurface(page, {
    redactedFieldNames: redactionPolicy.redactedFieldNames,
  });

  const registry = new SessionRegistry();
  const sessionId = 'handoff-session';
  registry.create(sessionId);

  const takeover = new OperatorTakeover(page, {
    hasControl: () => operatorHoldsControl(registry, sessionId),
    onInput: (input) => recordOperatorInput(registry, sessionId, input),
  });

  const terminal = createInterface({ input: process.stdin, output: process.stderr });

  try {
    const runId = crypto.randomUUID();
    registry.startRun(sessionId, runId, capability.capabilityId);

    const { runLog: firstAttempt, intervention } = await execute({
      capability,
      surface,
      inputs: args.inputs,
      runId,
      session: { registry, sessionId },
      // A bare filename, so a copied evidence folder still resolves it.
      captureFailureFrame: async () => {
        await writeFile(join(runDirectory, 'intervention.png'), await surface.screenshot());
        return 'intervention.png';
      },
    });

    if (!intervention) {
      console.error('');
      console.error(`The run finished as ${firstAttempt.outcome?.classification} without getting stuck.`);
      console.error('Pick inputs that escalate — member 77777 expires the session mid-run.');
      await writeFile(
        join(runDirectory, 'runlog.json'),
        JSON.stringify(redactRunLog(firstAttempt, redactionPolicy), null, 2) + '\n',
        'utf-8',
      );
      process.exit(1);
    }

    console.error('');
    console.error(`Stuck: ${intervention.failureCode} — ${intervention.message}`);
    console.error(`  at step:  ${intervention.failedAtStepId ?? 'unknown'}`);
    console.error(`  last ok:  ${intervention.context.lastSuccessfulStepId ?? 'none'}`);
    console.error(`  page:     ${intervention.context.pageUrl ?? 'unknown'}`);
    console.error(`  frame:    ${intervention.context.screenshotPath ?? 'none'}`);

    // Before the hand-off the token is still the system's, and the takeover
    // refuses input. This is that guarantee, exercised rather than asserted.
    const refusedBeforeHandoff = await takeover
      .dispatch({ inputType: 'key_press', key: 'Escape' })
      .then(() => false)
      .catch(() => true);
    console.error(`  operator input before hand-off refused: ${refusedBeforeHandoff}`);

    handOff(registry, sessionId, 'operator-cli');
    console.error('');
    console.error('The session is yours. Fix it in the browser window — for an expired session,');
    console.error('sign back in and return to the member search page.');

    if (process.stdin.isTTY) {
      await terminal.question('Press Enter when you are done and control goes back. ');
    } else {
      // No terminal to wait on. The hand-back still runs, so the mechanism is
      // exercised end to end — the run just resumes into a page nobody fixed,
      // which the re-assertion gate is entitled to refuse.
      console.error('(no terminal attached — handing back immediately)');
    }

    // Routed through the takeover so it lands in the ledger the same way a
    // console-driven click would, rather than being a special case.
    await takeover.dispatch({ inputType: 'key_press', key: 'Escape' });

    handBack(registry, sessionId, 'operator-cli');
    resolveIntervention(registry, sessionId);

    const resumeAtStepId = intervention.failedAtStepId ?? capability.steps[0]!.stepId;
    console.error('');
    console.error(`Resuming at "${resumeAtStepId}" once the previous step's checkpoints re-assert.`);

    const { runLog: resumed } = await execute({
      capability,
      surface,
      inputs: args.inputs,
      runId,
      session: { registry, sessionId },
      resumeAtStepId,
    });

    const session = registry.get(sessionId);
    const outcome = resumed.outcome?.classification ?? 'unknown';

    await writeFile(
      join(runDirectory, 'runlog.json'),
      JSON.stringify(redactRunLog(resumed, redactionPolicy), null, 2) + '\n',
      'utf-8',
    );
    await writeFile(
      join(runDirectory, 'intervention.json'),
      JSON.stringify(intervention, null, 2) + '\n',
      'utf-8',
    );
    await writeFile(
      join(runDirectory, 'policy.json'),
      JSON.stringify(redactionPolicy, null, 2) + '\n',
      'utf-8',
    );
    await writeFile(
      join(runDirectory, 'ledger.json'),
      JSON.stringify({ sessionId, state: session.state, ledger: session.ledger, interventions: session.interventions }, null, 2) + '\n',
      'utf-8',
    );

    await syncRunLog(redactRunLog(resumed, redactionPolicy));
    await syncIntervention(intervention, session.ledger);

    console.error('');
    console.error(`Outcome after hand-back: ${outcome}`);
    console.error(`Ledger: ${join(runDirectory, 'ledger.json')} (${session.ledger.length} entries)`);
    process.exit(outcome === 'success' || outcome === 'recovered' ? 0 : 1);
  } finally {
    terminal.close();
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
