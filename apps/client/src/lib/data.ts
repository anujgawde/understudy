import type { Capability, DiscoveryRun, RunLog } from '@/types';
import {
  readCapabilities as readCapabilitiesFromDisk,
  readCapability as readCapabilityFromDisk,
  readReplayRuns as readReplayRunsFromDisk,
  readReplayRun as readReplayRunFromDisk,
  readDiscoveryRunLog as readDiscoveryFromDisk,
} from './evidence-reader';
import {
  adaptCapability,
  adaptReplayRunLog,
  adaptDiscoveryRunLog,
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
