import type { Capability, RunLog } from '@understudy/schemas';

const SERVER_URL = process.env.UNDERSTUDY_SERVER_URL;

export function serverSyncEnabled(): boolean {
  return !!SERVER_URL;
}

export async function syncCapability(capability: Capability): Promise<void> {
  if (!SERVER_URL) return;
  try {
    await fetch(`${SERVER_URL}/capabilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(capability),
    });
  } catch (error) {
    console.error(`Server sync (capability): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function syncRunLog(runLog: RunLog): Promise<void> {
  if (!SERVER_URL) return;
  try {
    await fetch(`${SERVER_URL}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(runLog),
    });
  } catch (error) {
    console.error(`Server sync (run): ${error instanceof Error ? error.message : String(error)}`);
  }
}
