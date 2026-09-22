import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import type { ModelProvider } from '@understudy/model-provider';
import { AnthropicProvider, GeminiProvider, OllamaProvider } from '@understudy/model-provider';
import type { Policy, RunLogEntry } from '@understudy/schemas';
import { PlaywrightSurface } from '@understudy/surface';
import { discover } from '@understudy/discovery';
import { recordCapability, shapeBusinessOutcomes } from '@understudy/recorder';
import { redactCapability, redactRunLog, redactText } from '@understudy/redaction';
import { defaultPolicy } from './policy.js';
import { syncCapability, syncRunLog } from './server-sync.js';

function parseCliArguments() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: 'string', short: 'u', default: 'http://localhost:4000' },
      headed: { type: 'boolean', default: false },
      output: { type: 'string', short: 'o', default: 'evidence' },
      provider: { type: 'string', short: 'p', default: 'gemini' },
      model: { type: 'string', short: 'm' },
      maxSteps: { type: 'string', short: 's' },
      'allow-mutations': { type: 'boolean', default: false },
    },
  });

  const goal = positionals[0];
  if (!goal) {
    console.error(
      'Usage: discover <goal> [--provider gemini|anthropic|ollama] [--url http://...] [--headed] ' +
        '[--output dir] [--model model-id] [--maxSteps n] [--allow-mutations]',
    );
    process.exit(1);
  }

  const provider = values.provider ?? 'gemini';
  if (provider !== 'gemini' && provider !== 'anthropic' && provider !== 'ollama') {
    console.error(
      `Unknown provider: "${provider}" (expected "gemini", "anthropic", or "ollama")`,
    );
    process.exit(1);
  }

  return {
    goal,
    provider: provider as 'gemini' | 'anthropic' | 'ollama',
    startUrl: values.url ?? 'http://localhost:4000',
    headed: values.headed ?? false,
    outputDirectory: values.output ?? 'evidence',
    modelId: values.model,
    maxSteps: values.maxSteps ? parseInt(values.maxSteps, 10) : undefined,
    allowMutations: values['allow-mutations'] ?? false,
  };
}

/**
 * Asks the operator, once per mutating action, on a terminal a person is
 * actually sitting at. Without one there is nobody to ask, and the honest
 * answer to a question nobody heard is no — so an unattended run refuses the
 * action and tells the model to find another way, rather than assuming consent
 * from the absence of an objection.
 */
async function confirmOnTerminal(request: {
  action: { actionType: string };
  actionClass: string;
  reason: string;
}): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error(
      `  [policy] denied ${request.actionClass} (${request.action.actionType}): no terminal to ask on. ` +
        'Pass --allow-mutations to approve mutating actions up front.',
    );
    return false;
  }

  const { createInterface } = await import('node:readline/promises');
  const terminal = createInterface({ input: process.stdin, output: process.stderr });

  try {
    const answer = await terminal.question(
      `  [policy] ${request.action.actionType} is a ${request.actionClass} action — ${request.reason}. Allow it? [y/N] `,
    );
    const approved = answer.trim().toLowerCase().startsWith('y');
    console.error(`  [policy] operator ${approved ? 'approved' : 'rejected'} the action`);
    return approved;
  } finally {
    terminal.close();
  }
}

/**
 * A capability is a task shape, not the instance it was discovered with. The id
 * is the key the artifact library is looked up by, so "look up member 12345 and
 * read the balance" and the same goal naming 67890 have to land on one id — the
 * steps are already parameterised, and an id that is not would split one
 * capability into a new file per member.
 *
 * The goal text itself is kept verbatim on the artifact. It is the record of
 * what was actually asked, and a real example alongside the declared inputs is
 * useful context when matching a later request against this capability.
 */
function capabilityIdFrom(goal: string, inputs: Record<string, string>): string {
  let shape = goal.toLowerCase();

  // Anything the run was handed is a parameter by definition. Single characters
  // are skipped because they match by coincidence rather than reference.
  for (const value of Object.values(inputs)) {
    if (value.length > 2) shape = shape.replaceAll(value.toLowerCase(), ' ');
  }

  const slug = shape
    // Member, account and reference numbers, which reach discovery through the
    // goal prose rather than through --input.
    .replace(/\d{3,}/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'discovered-capability';
}

function formatEntryForConsole(entry: RunLogEntry, policy: Policy): string | null {
  switch (entry.entryType) {
    case 'rationale':
      return `  [model] ${entry.text}`;
    case 'action':
      return `  [${entry.actor}] ${entry.action.actionType}${entry.succeeded ? '' : ' FAILED'}`;
    case 'observation':
      return `  [${entry.actor}] observed: ${entry.observation.url} (${entry.observation.elements.length} elements)`;
    case 'policy_decision':
      return `  [policy] ${entry.actionClass} → ${entry.decision}: ${entry.reason}`;
    case 'extraction':
      return `  [extract] ${entry.outputName} = "${redactText(entry.rawValue, policy)}"`;
    default:
      return null;
  }
}

async function main(): Promise<void> {
  const args = parseCliArguments();

  let modelProvider: ModelProvider;
  if (args.provider === 'anthropic') {
    modelProvider = new AnthropicProvider({ modelId: args.modelId });
  } else if (args.provider === 'ollama') {
    modelProvider = new OllamaProvider({ modelId: args.modelId });
  } else {
    modelProvider = new GeminiProvider({ modelId: args.modelId });
  }

  console.error(`Goal: ${args.goal}`);
  console.error(`Target: ${args.startUrl}`);
  console.error(`Provider: ${args.provider}`);
  console.error(`Model: ${modelProvider.modelId}`);
  console.error('');

  const browser = await chromium.launch({ headless: !args.headed });
  const page = await browser.newPage();

  // The id depends only on the goal, so the evidence folder can be opened before
  // the run starts. A discovery that fails then still leaves its log and frames
  // somewhere findable instead of in a flat pile named by uuid.
  const capabilityId = capabilityIdFrom(args.goal, {});
  const capabilityDirectory = join(args.outputDirectory, capabilityId);
  const discoveryDirectory = join(capabilityDirectory, 'discovery');

  const policy = defaultPolicy(args.startUrl, args.maxSteps ?? 30, args.allowMutations);

  const surface = new PlaywrightSurface(page, {
    screenshotDirectory: join(discoveryDirectory, 'screenshots'),
    redactedFieldNames: policy.redactedFieldNames,
  });

  try {
    const { runLog: recordedRunLog } = await discover({
      goal: args.goal,
      startUrl: args.startUrl,
      surface,
      modelProvider,
      policy,
      maxSteps: args.maxSteps,
      onConfirmAction: confirmOnTerminal,
      onEntry(entry) {
        const line = formatEntryForConsole(entry, policy);
        if (line) console.error(line);
      },
    });

    // Redaction happens at the boundary, not at the source: the recorder still
    // sees the real values, because it has to tell a value that came from
    // outside the page from a constant of the flow. Only what gets written out
    // is scrubbed.
    const runLog = redactRunLog(recordedRunLog, policy);

    await mkdir(discoveryDirectory, { recursive: true });
    const runLogPath = join(discoveryDirectory, 'runlog.json');
    await writeFile(runLogPath, JSON.stringify(runLog, null, 2) + '\n', 'utf-8');
    await syncRunLog(runLog);

    console.error('');
    console.error(`Outcome: ${runLog.outcome?.classification ?? 'unknown'}`);
    console.error(`Run log: ${runLogPath}`);
    console.error(`Steps: ${runLog.entries.filter((e) => e.entryType === 'action').length}`);

    if (runLog.outcome?.classification !== 'success') {
      console.log(JSON.stringify(runLog, null, 2));
      process.exit(1);
    }

    const recorded = recordCapability(recordedRunLog, {
      capabilityId,
      name: args.goal,
      modelId: modelProvider.modelId,
      policy,
    });

    // The run only ever showed the path that worked, so the checkpoints above
    // have structure but no meaning. Naming them is what stops "no such member"
    // replaying as a crash. Losing the names is a smaller loss than losing the
    // capability, so a failure here is reported and stepped over.
    let businessOutcomes: typeof recorded.businessOutcomes = [];
    try {
      businessOutcomes = await shapeBusinessOutcomes(recorded, modelProvider);
    } catch (error) {
      console.error(
        `Could not shape business outcomes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const capability = redactCapability({ ...recorded, businessOutcomes }, policy);

    const capabilityPath = join(capabilityDirectory, 'capability.json');
    await writeFile(capabilityPath, JSON.stringify(capability, null, 2) + '\n', 'utf-8');
    await syncCapability(capability);

    console.error(`Capability: ${capabilityPath}`);
    console.error(
      `Inputs: ${capability.inputs.map((input) => input.name).join(', ') || 'none'} · ` +
        `Outputs: ${capability.outputs.map((output) => output.name).join(', ') || 'none'}`,
    );
    console.error(
      `Checkpoints: ${capability.checkpoints.length} · ` +
        `Business outcomes: ${capability.businessOutcomes.map((rule) => rule.code).join(', ') || 'none'}`,
    );

    console.log(JSON.stringify(capability, null, 2));
    process.exit(0);
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
