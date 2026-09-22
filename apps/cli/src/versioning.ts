import { readFile, rename } from 'node:fs/promises';

/**
 * A capability id names the task, not one recording of it, so re-running
 * discovery for the same goal produces a new version of the same capability
 * rather than a different capability. The previous file is kept: an artifact
 * records how a flow worked on a given day, and overwriting it throws away the
 * only copy of what replay was doing before today — which is what you want to
 * compare against when a fresh recording starts behaving differently.
 *
 * Returns the version the next write should carry.
 */
export async function archivePreviousVersion(capabilityPath: string): Promise<number> {
  let previous: { version?: number };
  try {
    previous = JSON.parse(await readFile(capabilityPath, 'utf-8'));
  } catch {
    // Nothing there, or nothing readable. Either way this is the first version.
    return 1;
  }

  const previousVersion = typeof previous.version === 'number' ? previous.version : 1;
  await rename(capabilityPath, capabilityPath.replace(/\.json$/, `.v${previousVersion}.json`));

  return previousVersion + 1;
}
