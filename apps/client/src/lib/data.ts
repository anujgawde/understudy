import type { Capability, DiscoveryRun, Intervention, LedgerEntry, RunLog } from '@/types';
import {
  readCapabilities as readCapabilitiesFromDisk,
  readCapability as readCapabilityFromDisk,
  readReplayRuns as readReplayRunsFromDisk,
  readReplayRun as readReplayRunFromDisk,
  readDiscoveryRunLog as readDiscoveryFromDisk,
  readInterventions as readInterventionsFromDisk,
  readLedger as readLedgerFromDisk,
} from './evidence-reader';
import {
  adaptCapability,
  adaptReplayRunLog,
  adaptDiscoveryRunLog,
  adaptIntervention,
} from './adapters';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function useServer(): boolean {
  return !!API_URL;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Server ${response.status}: ${path}`);
  return response.json() as Promise<T>;
}

export async function getCapabilities(): Promise<Capability[]> {
  if (useServer()) {
    return fetchJson<Capability[]>('/capabilities');
  }

  const schemas = await readCapabilitiesFromDisk();
  return schemas.map(adaptCapability);
}

export async function getCapability(capabilityId: string): Promise<Capability | null> {
  if (useServer()) {
    try {
      return await fetchJson<Capability>(`/capabilities/${capabilityId}`);
    } catch {
      return null;
    }
  }

  const schema = await readCapabilityFromDisk(capabilityId);
  return schema ? adaptCapability(schema) : null;
}

export async function getReplayRuns(capabilityId?: string): Promise<RunLog[]> {
  if (useServer()) {
    const query = capabilityId ? `?capabilityId=${capabilityId}` : '';
    return fetchJson<RunLog[]>(`/runs${query}`);
  }

  const entries = await readReplayRunsFromDisk(capabilityId);
  const capabilities = await readCapabilitiesFromDisk();
  return entries.map(({ runLog, evidencePath }) => {
    const capability = capabilities.find((c) => c.capabilityId === runLog.capabilityId) ?? null;
    return adaptReplayRunLog(runLog, capability, evidencePath);
  });
}

export async function getReplayRun(runId: string): Promise<RunLog | null> {
  if (useServer()) {
    try {
      return await fetchJson<RunLog>(`/runs/${runId}`);
    } catch {
      return null;
    }
  }

  const entry = await readReplayRunFromDisk(runId);
  if (!entry) return null;

  const capabilities = await readCapabilitiesFromDisk();
  const capability = capabilities.find((c) => c.capabilityId === entry.runLog.capabilityId) ?? null;
  return adaptReplayRunLog(entry.runLog, capability, entry.evidencePath);
}

export async function getDiscoveryRunByRunId(runId: string): Promise<DiscoveryRun | null> {
  if (useServer()) {
    try {
      return await fetchJson<DiscoveryRun>(`/runs/${runId}`);
    } catch {
      return null;
    }
  }

  const capabilities = await readCapabilitiesFromDisk();
  for (const capability of capabilities) {
    const entry = await readDiscoveryFromDisk(capability.capabilityId);
    if (entry && entry.runLog.runId === runId) return adaptDiscoveryRunLog(entry.runLog);
  }
  return null;
}

export async function getDiscoveryRun(capabilityId: string): Promise<DiscoveryRun | null> {
  if (useServer()) {
    try {
      return await fetchJson<DiscoveryRun>(`/runs?capabilityId=${capabilityId}&mode=discovery`);
    } catch {
      return null;
    }
  }

  const entry = await readDiscoveryFromDisk(capabilityId);
  if (!entry) return null;
  return adaptDiscoveryRunLog(entry.runLog);
}

/**
 * Interventions the system has actually raised. In server mode they come from
 * the server's own store; standalone they are read from the run directories
 * they were written beside, which is also what makes them survive the process
 * that raised them.
 */
export async function getInterventions(): Promise<Intervention[]> {
  if (useServer()) {
    return fetchJson<Intervention[]>('/interventions');
  }

  const [records, capabilities] = await Promise.all([
    readInterventionsFromDisk(),
    readCapabilitiesFromDisk(),
  ]);

  return records.map(({ intervention, evidencePath }) =>
    adaptIntervention(
      intervention,
      capabilities.find((one) => one.capabilityId === intervention.context.capabilityId) ?? null,
      evidencePath,
    ),
  );
}

export async function getIntervention(interventionId: string): Promise<Intervention | null> {
  const all = await getInterventions();
  return all.find((one) => one.interventionId === interventionId) ?? null;
}

/**
 * The session ledger from the most recent handoff run. Every transfer of
 * control and everything the operator did while they held it, tagged with who
 * did it — which is the record the design promises and deliberately never
 * folds back into an artifact.
 */
export async function getLedger(): Promise<LedgerEntry[]> {
  if (useServer()) {
    try {
      return await fetchJson<LedgerEntry[]>('/interventions/ledger');
    } catch {
      return [];
    }
  }

  const entries = await readLedgerFromDisk();
  return entries.map((entry) => ({
    entryId: entry.entryId,
    occurredAt: new Date(entry.occurredAt).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    actor: entry.actor,
    summary: describeLedgerAction(entry.action, entry.detail),
  }));
}

function describeLedgerAction(action: string, detail?: Record<string, unknown>): string {
  switch (action) {
    case 'session_created':
      return 'session created';
    case 'run_started':
      return `run started · ${String(detail?.['capabilityId'] ?? '')}`.trim();
    case 'intervention_raised':
      return `escalated · ${String(detail?.['failureCode'] ?? 'unknown')}`;
    case 'handed_off':
      return `control handed to ${String(detail?.['operatorId'] ?? 'operator')}`;
    case 'operator_input':
      return detail?.['characters'] !== undefined
        ? `typed ${String(detail['characters'])} characters`
        : `operator ${String(detail?.['inputType'] ?? 'input')}`;
    case 'handed_back':
      return `control handed back by ${String(detail?.['operatorId'] ?? 'operator')}`;
    case 'run_resumed':
      return 'run resumed';
    case 'run_completed':
      return 'run completed';
    default:
      return action;
  }
}
