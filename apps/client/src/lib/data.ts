import type {
  Capability,
  DiscoveryRun,
  Intervention,
  LedgerEntry,
  PolicyProfile,
  RunLog,
  ShapingSession,
} from '@/types';
import { ESCALATION_WORTHY_FAILURES } from '@understudy/session';
import type {
  Intervention as SchemaIntervention,
  LedgerEntry as SchemaLedgerEntry,
} from '@understudy/session';
import type {
  Capability as SchemaCapability,
  Policy as SchemaPolicy,
  RunLog as SchemaRunLog,
} from '@understudy/schemas';
import {
  readCapabilities as readCapabilitiesFromDisk,
  readCapability as readCapabilityFromDisk,
  readReplayRuns as readReplayRunsFromDisk,
  readReplayRun as readReplayRunFromDisk,
  readDiscoveryRunLog as readDiscoveryFromDisk,
  readInterventions as readInterventionsFromDisk,
  readLedger as readLedgerFromDisk,
  readPolicy as readPolicyFromDisk,
} from './evidence-reader';
import {
  adaptCapability,
  adaptReplayRunLog,
  adaptDiscoveryRunLog,
  adaptIntervention,
  adaptPolicy,
  adaptShaping,
} from './adapters';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Standalone by default, server-backed when NEXT_PUBLIC_API_URL is set. Both
 * paths return the same console types: the server speaks the schema, the
 * evidence folder holds the schema, and the adapters are the one place either
 * becomes something a screen can draw. Returning raw schema objects on the
 * server path — which this did — meant every page worked standalone and threw
 * the moment a server was connected.
 */
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
    const schemas = await fetchJson<SchemaCapability[]>('/capabilities');
    return schemas.map(adaptCapability);
  }

  const schemas = await readCapabilitiesFromDisk();
  return schemas.map(adaptCapability);
}

export async function getCapability(capabilityId: string): Promise<Capability | null> {
  if (useServer()) {
    try {
      return adaptCapability(await fetchJson<SchemaCapability>(`/capabilities/${capabilityId}`));
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
    const [runLogs, schemas] = await Promise.all([
      fetchJson<SchemaRunLog[]>(`/runs${query}`),
      fetchJson<SchemaCapability[]>('/capabilities'),
    ]);

    return runLogs
      .filter((runLog) => runLog.mode === 'replay')
      .map((runLog) =>
        adaptReplayRunLog(
          runLog,
          schemas.find((one) => one.capabilityId === runLog.capabilityId) ?? null,
          `server:${runLog.runId}`,
        ),
      );
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
      const runLog = await fetchJson<SchemaRunLog>(`/runs/${runId}`);
      const schemas = await fetchJson<SchemaCapability[]>('/capabilities');
      return adaptReplayRunLog(
        runLog,
        schemas.find((one) => one.capabilityId === runLog.capabilityId) ?? null,
        `server:${runLog.runId}`,
      );
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
      return adaptDiscoveryRunLog(await fetchJson<SchemaRunLog>(`/runs/${runId}`));
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
      const runLogs = await fetchJson<SchemaRunLog[]>(`/runs?capabilityId=${capabilityId}`);
      const discovery = runLogs.find((runLog) => runLog.mode === 'discovery');
      return discovery ? adaptDiscoveryRunLog(discovery) : null;
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
    const [records, schemas] = await Promise.all([
      fetchJson<SchemaIntervention[]>('/interventions'),
      fetchJson<SchemaCapability[]>('/capabilities'),
    ]);

    return records.map((intervention) =>
      adaptIntervention(
        intervention,
        schemas.find((one) => one.capabilityId === intervention.context.capabilityId) ?? null,
        `server:${intervention.context.runId}`,
      ),
    );
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
  const entries = useServer()
    ? await fetchJson<SchemaLedgerEntry[]>('/interventions/ledger').catch(() => [])
    : await readLedgerFromDisk();
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

/**
 * The policy that governed the most recent run that recorded one. Read from the
 * run rather than from a config file, so the screen shows what was enforced
 * rather than what is configured somewhere.
 */
export async function getPolicyProfile(): Promise<PolicyProfile | null> {
  if (useServer()) {
    try {
      const policies = await fetchJson<SchemaPolicy[]>('/policy');
      const policy = policies[0];
      return policy ? adaptPolicy(policy, [...ESCALATION_WORTHY_FAILURES], 'server:/policy') : null;
    } catch {
      return null;
    }
  }

  const found = await readPolicyFromDisk();
  if (!found) return null;

  return adaptPolicy(found.policy, [...ESCALATION_WORTHY_FAILURES], found.evidencePath);
}

/**
 * How one capability was shaped out of its discovery run. Keyed by capability
 * rather than by run, because the artifact is the thing being reviewed and the
 * run is only where it came from.
 */
export async function getShaping(capabilityId: string): Promise<ShapingSession | null> {
  const capability = await getCapability(capabilityId);
  if (!capability) return null;

  const discovery = await getDiscoveryRun(capabilityId);
  const schemas = await readCapabilitiesFromDisk();
  const schema = schemas.find((one) => one.capabilityId === capabilityId);
  if (!schema) return null;

  return adaptShaping(
    schema,
    discovery?.runId ?? 'no discovery run recorded',
    `evidence/${capabilityId}`,
  );
}
