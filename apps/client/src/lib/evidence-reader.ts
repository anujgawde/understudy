import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  Capability as SchemaCapability,
  Policy as SchemaPolicy,
  RunLog as SchemaRunLog,
} from '@understudy/schemas';
import type { Intervention as SchemaIntervention, LedgerEntry } from '@understudy/session';

const EVIDENCE_DIR = process.env.EVIDENCE_DIR
  ? resolve(process.env.EVIDENCE_DIR)
  : resolve(process.cwd(), '..', '..', 'evidence');

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function capabilityDirs(): Promise<string[]> {
  if (!(await exists(EVIDENCE_DIR))) return [];
  const entries = await readdir(EVIDENCE_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(EVIDENCE_DIR, entry.name));
}

export async function readCapabilities(): Promise<SchemaCapability[]> {
  const dirs = await capabilityDirs();
  const results: SchemaCapability[] = [];
  for (const dir of dirs) {
    const capability = await readJson<SchemaCapability>(join(dir, 'capability.json'));
    if (capability) results.push(capability);
  }
  return results;
}

export async function readCapability(capabilityId: string): Promise<SchemaCapability | null> {
  const dirs = await capabilityDirs();
  for (const dir of dirs) {
    const capability = await readJson<SchemaCapability>(join(dir, 'capability.json'));
    if (capability && capability.capabilityId === capabilityId) return capability;
  }
  return null;
}

export async function readReplayRuns(capabilityId?: string): Promise<Array<{ runLog: SchemaRunLog; evidencePath: string }>> {
  const dirs = await capabilityDirs();
  const results: Array<{ runLog: SchemaRunLog; evidencePath: string }> = [];

  for (const dir of dirs) {
    const replaysDir = join(dir, 'replays');
    if (!(await exists(replaysDir))) continue;

    const outcomes = await readdir(replaysDir, { withFileTypes: true });
    for (const outcomeDir of outcomes) {
      if (!outcomeDir.isDirectory()) continue;
      const outcomePath = join(replaysDir, outcomeDir.name);
      const runDirs = await readdir(outcomePath, { withFileTypes: true });

      for (const runDir of runDirs) {
        if (!runDir.isDirectory()) continue;
        const runPath = join(outcomePath, runDir.name);
        const runLog = await readJson<SchemaRunLog>(join(runPath, 'runlog.json'));
        if (!runLog) continue;
        if (capabilityId && runLog.capabilityId !== capabilityId) continue;
        results.push({ runLog, evidencePath: runPath });
      }
    }
  }
  return results;
}

export async function readReplayRun(runId: string): Promise<{ runLog: SchemaRunLog; evidencePath: string } | null> {
  const all = await readReplayRuns();
  return all.find((entry) => entry.runLog.runId === runId) ?? null;
}

export async function readDiscoveryRunLog(capabilityId: string): Promise<{ runLog: SchemaRunLog; evidencePath: string } | null> {
  const dirs = await capabilityDirs();
  for (const dir of dirs) {
    const capPath = join(dir, 'capability.json');
    const capability = await readJson<SchemaCapability>(capPath);
    if (!capability || capability.capabilityId !== capabilityId) continue;

    const discoveryPath = join(dir, 'discovery');
    const runLog = await readJson<SchemaRunLog>(join(discoveryPath, 'runlog.json'));
    if (runLog) return { runLog, evidencePath: discoveryPath };
  }
  return null;
}

/**
 * Every run directory that might hold one, walked the same way replays are.
 * An intervention is written beside the run that raised it rather than into a
 * directory of its own, because the run log is the context an operator needs
 * and separating them would mean reuniting them here.
 */
async function runDirectories(): Promise<string[]> {
  const found: string[] = [];

  for (const dir of await capabilityDirs()) {
    for (const section of ['handoff', 'verification', 'discovery']) {
      const path = join(dir, section);
      if (await exists(path)) found.push(path);
    }

    const replaysDir = join(dir, 'replays');
    if (!(await exists(replaysDir))) continue;

    for (const outcomeDir of await readdir(replaysDir, { withFileTypes: true })) {
      if (!outcomeDir.isDirectory()) continue;
      const outcomePath = join(replaysDir, outcomeDir.name);

      for (const runDir of await readdir(outcomePath, { withFileTypes: true })) {
        if (runDir.isDirectory()) found.push(join(outcomePath, runDir.name));
      }
    }
  }

  return found;
}

export async function readInterventions(): Promise<
  Array<{ intervention: SchemaIntervention; evidencePath: string; runLog: SchemaRunLog | null }>
> {
  const results: Array<{
    intervention: SchemaIntervention;
    evidencePath: string;
    runLog: SchemaRunLog | null;
  }> = [];

  for (const path of await runDirectories()) {
    const intervention = await readJson<SchemaIntervention>(join(path, 'intervention.json'));
    if (!intervention) continue;
    results.push({
      intervention,
      evidencePath: path,
      runLog: await readJson<SchemaRunLog>(join(path, 'runlog.json')),
    });
  }

  return results.sort((left, right) =>
    right.intervention.raisedAt.localeCompare(left.intervention.raisedAt),
  );
}

export async function readLedger(): Promise<LedgerEntry[]> {
  for (const path of await runDirectories()) {
    const handoff = await readJson<{ ledger: LedgerEntry[] }>(join(path, 'ledger.json'));
    if (handoff?.ledger) return handoff.ledger;
  }
  return [];
}

/**
 * The policy in force for the most recent run that recorded one. Policies are
 * written per run rather than kept in one place, so what the screen shows is
 * what actually governed something rather than what a config file claims.
 */
export async function readPolicy(): Promise<{ policy: SchemaPolicy; evidencePath: string } | null> {
  const candidates: Array<{ policy: SchemaPolicy; evidencePath: string }> = [];

  for (const path of await runDirectories()) {
    const policy = await readJson<SchemaPolicy>(join(path, 'policy.json'));
    if (policy) candidates.push({ policy, evidencePath: path });
  }

  return candidates[0] ?? null;
}

export function evidenceDirectory(): string {
  return EVIDENCE_DIR;
}
