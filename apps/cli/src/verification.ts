import type { Capability, RunLog } from '@understudy/schemas';
import type { Surface } from '@understudy/surface';
import { execute } from '@understudy/replay';

export interface VerificationResult {
  approved: boolean;
  reason: string;
  runLog: RunLog;
}

/** The values discovery actually read off the page, in the order it read them. */
function discoveredValues(discoveryRunLog: RunLog): string[] {
  return discoveryRunLog.entries
    .filter((entry) => entry.entryType === 'extraction')
    .map((entry) => (entry.entryType === 'extraction' ? entry.rawValue : ''))
    .map(normalise)
    .filter((value) => value !== '');
}

/**
 * Compared loosely on purpose. Replay coerces "$4,182.90" to the number 4182.9
 * while discovery recorded the string it saw, so the two disagree on currency
 * symbols, separators and trailing zeros while meaning the same thing. A
 * verification that failed on formatting would reject artifacts that work.
 */
function normalise(value: unknown): string {
  const stripped = String(value ?? '').replace(/[$,\s]/g, '');
  const asNumber = Number(stripped);

  // Numeric values are compared as numbers, so 4182.90 and 4182.9 agree.
  if (stripped !== '' && !Number.isNaN(asNumber)) return String(asNumber);

  return stripped.toLowerCase();
}

/**
 * Replays a freshly recorded artifact once, with the inputs discovery itself
 * used, and reports whether it earned the right to be called approved.
 *
 * This is the only thing that makes `status` mean anything. Until it existed,
 * every capability was stamped approved because the model said its run went
 * well — a claim about the run, not about the artifact distilled from it. The
 * locators were derived, the checkpoints inferred and the parameters guessed
 * after the model had stopped looking, and none of that was ever exercised
 * until some later caller depended on it.
 *
 * Two things have to hold. The replay has to reach its outputs, and those
 * outputs have to be the ones discovery read. A run that succeeds while
 * returning different values is the more dangerous failure of the two: it
 * means the locators resolved to something, just not the right something.
 */
export async function verifyCapability(
  capability: Capability,
  surface: Surface,
  inputs: Record<string, string>,
  discoveryRunLog: RunLog,
): Promise<VerificationResult> {
  const { runLog } = await execute({ capability, surface, inputs });
  const outcome = runLog.outcome;

  if (outcome?.classification !== 'success' && outcome?.classification !== 'recovered') {
    const detail =
      outcome?.classification === 'failed'
        ? `${outcome.failureCode}: ${outcome.message}`
        : (outcome?.classification ?? 'no outcome');
    return { approved: false, reason: `the verification replay did not succeed (${detail})`, runLog };
  }

  const missing = capability.outputs
    .filter((output) => output.required)
    .map((output) => output.name)
    .filter((name) => {
      const value = outcome.outputs[name];
      return value === undefined || value === null || String(value).trim() === '';
    });

  if (missing.length > 0) {
    return {
      approved: false,
      reason: `the replay returned no value for ${missing.join(', ')}`,
      runLog,
    };
  }

  const expected = discoveredValues(discoveryRunLog);
  const actual = Object.values(outcome.outputs).map(normalise);
  const unmatched = expected.filter((value) => !actual.includes(value));

  if (unmatched.length > 0) {
    return {
      approved: false,
      reason: `the replay returned different values than discovery read (missing: ${unmatched.join(', ')})`,
      runLog,
    };
  }

  return {
    approved: true,
    reason: `replayed cleanly and returned the values discovery read`,
    runLog,
  };
}
