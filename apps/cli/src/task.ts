import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { ModelProvider } from '@understudy/model-provider';
import { AnthropicProvider, GeminiProvider, OllamaProvider } from '@understudy/model-provider';
import { Capability } from '@understudy/schemas';
import { matchCapability } from './match.js';

function parseCliArguments() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: 'string', short: 'i', multiple: true, default: [] },
      url: { type: 'string', short: 'u', default: 'http://localhost:4000' },
      headed: { type: 'boolean', default: false },
      output: { type: 'string', short: 'o', default: 'evidence' },
      provider: { type: 'string', short: 'p', default: 'gemini' },
      model: { type: 'string', short: 'm' },
      'approve-irreversible': { type: 'boolean', default: false },
    },
  });

  const goal = positionals[0];
  if (!goal) {
    console.error(
      'Usage: task <goal> [--input key=value ...] [--provider gemini|anthropic|ollama] ' +
        '[--url http://...] [--headed] [--output dir] [--model model-id] [--approve-irreversible]',
    );
    process.exit(1);
  }

  const provider = values.provider ?? 'gemini';
  if (provider !== 'gemini' && provider !== 'anthropic' && provider !== 'ollama') {
    console.error(`Unknown provider: "${provider}" (expected "gemini", "anthropic", or "ollama")`);
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
    goal,
    inputs,
    provider: provider as 'gemini' | 'anthropic' | 'ollama',
    startUrl: values.url ?? 'http://localhost:4000',
    headed: values.headed ?? false,
    outputDirectory: values.output ?? 'evidence',
    modelId: values.model,
    approveIrreversible: values['approve-irreversible'] ?? false,
  };
}

/**
 * Every capability the library holds. A directory that does not contain a valid
 * capability.json is skipped rather than fatal — a discovery that failed leaves
 * its log behind in exactly that shape.
 */
async function loadCapabilities(
  outputDirectory: string,
): Promise<{ capability: Capability; path: string }[]> {
  let directories: string[];
  try {
    directories = (await readdir(outputDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const loaded: { capability: Capability; path: string }[] = [];

  for (const directory of directories) {
    const path = join(outputDirectory, directory, 'capability.json');
    try {
      const parsed = Capability.safeParse(JSON.parse(await readFile(path, 'utf-8')));
      if (parsed.success) loaded.push({ capability: parsed.data, path });
    } catch {
      continue;
    }
  }

  return loaded;
}

function buildModelProvider(args: ReturnType<typeof parseCliArguments>): ModelProvider {
  switch (args.provider) {
    case 'anthropic':
      return new AnthropicProvider({ modelId: args.modelId });
    case 'ollama':
      return new OllamaProvider({ modelId: args.modelId });
    case 'gemini':
      return new GeminiProvider({ modelId: args.modelId });
  }
}

// discover and replay both end in process.exit, so they are run as themselves
// rather than imported. It also keeps one implementation of the evidence
// layout, the redaction and the exit codes instead of a second copy here.
function delegate(script: string, scriptArguments: string[]): Promise<number> {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      join(dirname(fileURLToPath(import.meta.url)), script),
      ...scriptArguments,
    ],
    { stdio: 'inherit' },
  );

  return new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  const args = parseCliArguments();
  const capabilities = await loadCapabilities(args.outputDirectory);

  console.error(`Request: ${args.goal}`);
  console.error(`Known capabilities: ${capabilities.length}`);

  const match =
    capabilities.length > 0
      ? await matchCapability(
          args.goal,
          capabilities.map((entry) => entry.capability),
          buildModelProvider(args),
        )
      : null;

  if (match === null) {
    console.error('No recorded capability performs this task — discovering it.');
    console.error('');
    process.exit(
      await delegate('discover.ts', [
        args.goal,
        '--provider',
        args.provider,
        '--url',
        args.startUrl,
        '--output',
        args.outputDirectory,
        ...(args.headed ? ['--headed'] : []),
        ...(args.modelId ? ['--model', args.modelId] : []),
      ]),
    );
  }

  const chosen = capabilities.find(
    (entry) => entry.capability.capabilityId === match.capabilityId,
  )!;

  // This is the unattended path: a request arrives, a capability is chosen and
  // it runs with nobody watching. A draft is an artifact nothing has replayed
  // successfully yet, so running one here is exactly the case the approval
  // state exists to stop. `replay` still runs drafts, because naming the file
  // is a person deciding to.
  if (chosen.capability.status !== 'approved') {
    console.error(`Matched: ${match.capabilityId}`);
    console.error('');
    console.error(`Refusing to run it: this capability is a draft.`);
    console.error('A draft has not been replayed successfully since it was recorded, so nothing');
    console.error('has confirmed its locators, checkpoints or parameters work.');
    console.error('');
    console.error('Re-run discovery to have it verified, or replay it directly and deliberately:');
    console.error(`  npm run replay ${chosen.path}`);
    process.exit(1);
  }

  // Anything passed on the command line wins: a secret is never in the request
  // text, and an operator overriding a bound value means to.
  const inputs = { ...match.inputs, ...args.inputs };

  console.error(`Matched: ${match.capabilityId}`);
  console.error(
    `Inputs: ${Object.keys(inputs).length > 0 ? Object.keys(inputs).join(', ') : 'none'}`,
  );
  console.error('Replaying with no model in the loop.');
  console.error('');

  process.exit(
    await delegate('replay.ts', [
      chosen.path,
      ...Object.entries(inputs).flatMap(([name, value]) => ['--input', `${name}=${value}`]),
      ...(args.headed ? ['--headed'] : []),
      ...(args.approveIrreversible ? ['--approve-irreversible'] : []),
    ]),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
