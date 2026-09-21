import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  Capability as SchemaCapability,
  RunLog as SchemaRunLog,
} from '@understudy/schemas';

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

export function evidenceDirectory(): string {
  return EVIDENCE_DIR;
}
