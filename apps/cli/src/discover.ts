import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import type { ModelProvider } from '@understudy/model-provider';
import { AnthropicProvider, GeminiProvider } from '@understudy/model-provider';
import type { RunLogEntry } from '@understudy/schemas';
import { PlaywrightSurface } from '@understudy/surface';
import { discover } from '@understudy/discovery';

function parseCliArguments() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: 'string', short: 'u', default: 'http://localhost:4100' },
      headed: { type: 'boolean', default: false },
      output: { type: 'string', short: 'o', default: 'evidence' },
      provider: { type: 'string', short: 'p', default: 'gemini' },
      model: { type: 'string', short: 'm' },
      maxSteps: { type: 'string', short: 's' },
    },
  });

  const goal = positionals[0];
  if (!goal) {
    console.error(
      'Usage: discover <goal> [--provider gemini|anthropic] [--url http://...] [--headed] [--output dir] [--model model-id] [--maxSteps n]',
    );
    process.exit(1);
  }

  const provider = values.provider ?? 'gemini';
  if (provider !== 'gemini' && provider !== 'anthropic') {
    console.error(`Unknown provider: "${provider}" (expected "gemini" or "anthropic")`);
    process.exit(1);
  }

  return {
    goal,
    provider: provider as 'gemini' | 'anthropic',
    startUrl: values.url ?? 'http://localhost:4100',
    headed: values.headed ?? false,
    outputDirectory: values.output ?? 'evidence',
    modelId: values.model,
    maxSteps: values.maxSteps ? parseInt(values.maxSteps, 10) : undefined,
  };
}

function formatEntryForConsole(entry: RunLogEntry): string | null {
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
      return `  [extract] ${entry.outputName} = "${entry.rawValue}"`;
    default:
      return null;
  }
}

async function main(): Promise<void> {
  const args = parseCliArguments();

  let modelProvider: ModelProvider;
  if (args.provider === 'anthropic') {
    modelProvider = new AnthropicProvider({ modelId: args.modelId });
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

  const screenshotDirectory = join(args.outputDirectory, 'screenshots');
  const surface = new PlaywrightSurface(page, { screenshotDirectory });

  try {
    const { runLog } = await discover({
      goal: args.goal,
      startUrl: args.startUrl,
      surface,
      modelProvider,
      maxSteps: args.maxSteps,
      onEntry(entry) {
        const line = formatEntryForConsole(entry);
        if (line) console.error(line);
      },
    });

    await mkdir(args.outputDirectory, { recursive: true });
    const runLogPath = join(args.outputDirectory, `${runLog.runId}.runlog.json`);
    await writeFile(runLogPath, JSON.stringify(runLog, null, 2) + '\n', 'utf-8');

    console.error('');
    console.error(`Outcome: ${runLog.outcome?.classification ?? 'unknown'}`);
    console.error(`Run log: ${runLogPath}`);
    console.error(`Steps: ${runLog.entries.filter((e) => e.entryType === 'action').length}`);

    console.log(JSON.stringify(runLog, null, 2));

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
