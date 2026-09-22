import type { Capability, Policy, RunLog } from '@understudy/schemas';
import type { Intervention, LedgerEntry } from '@understudy/session';

const SERVER_URL = process.env.UNDERSTUDY_SERVER_URL;

export function serverSyncEnabled(): boolean {
  return !!SERVER_URL;
}

/**
 * Posts one thing to the server, if one is configured.
 *
 * A failure here does not fail the run — the evidence is already on disk and
 * the work stands without the server. It does have to be loud, though: this
 * used to log a line indistinguishable from the rest of the output, so a run
 * could report success while the server never received any of it.
 */
async function post(path: string, body: unknown, description: string): Promise<void> {
  if (!SERVER_URL) return;

  try {
    const response = await fetch(`${SERVER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(
        `  [server] NOT SYNCED — ${description}: ${SERVER_URL}${path} returned ${response.status}`,
      );
      return;
    }

    console.error(`  [server] synced ${description}`);
  } catch (error) {
    console.error(
      `  [server] NOT SYNCED — ${description}: ${SERVER_URL}${path} is unreachable ` +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

export async function syncCapability(capability: Capability): Promise<void> {
  await post('/capabilities', capability, `capability ${capability.capabilityId}`);
}

export async function syncRunLog(runLog: RunLog): Promise<void> {
  await post('/runs', runLog, `run ${runLog.runId}`);
}

export async function syncIntervention(
  intervention: Intervention,
  ledger?: LedgerEntry[],
): Promise<void> {
  await post(
    '/interventions',
    { intervention, ledger },
    `intervention ${intervention.interventionId}`,
  );
}

export async function syncPolicy(policy: Policy): Promise<void> {
  await post('/policy', policy, `policy ${policy.policyId}`);
}
