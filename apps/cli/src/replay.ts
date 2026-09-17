import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { Capability } from '@understudy/schemas';
import { PlaywrightSurface } from '@understudy/surface';
import { execute } from '@understudy/replay';

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
    console.error('Usage: replay <artifact.json> [--input key=value ...] [--headed] [--output path]');
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

  const browser = await chromium.launch({ headless: !args.headed });
  const page = await browser.newPage();
  const surface = new PlaywrightSurface(page);

  try {
    const { runLog } = await execute({ capability, surface, inputs: args.inputs });

    const json = JSON.stringify(runLog, null, 2);

    if (args.outputPath) {
      await writeFile(args.outputPath, json + '\n', 'utf-8');
      console.error(`Run log written to ${args.outputPath}`);
    }

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
