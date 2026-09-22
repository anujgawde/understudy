import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archivePreviousVersion } from '../src/versioning.js';

/** Writes a capability the way the discover CLI does: archive, then write. */
async function recordAgain(directory: string): Promise<number> {
  const capabilityPath = join(directory, 'capability.json');
  const version = await archivePreviousVersion(capabilityPath);

  await writeFile(
    capabilityPath,
    JSON.stringify({ capabilityId: 'lookup', version }, null, 2),
    'utf-8',
  );

  return version;
}

describe('Capability versioning on re-discovery', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'understudy-versioning-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test('the first recording is version 1 and archives nothing', async () => {
    await recordAgain(directory);

    const current = JSON.parse(await readFile(join(directory, 'capability.json'), 'utf-8'));
    expect(current.version).toBe(1);
    expect(await readdir(directory)).toEqual(['capability.json']);
  });

  test('re-discovery increments the version and keeps the previous file', async () => {
    await recordAgain(directory);
    await recordAgain(directory);
    await recordAgain(directory);

    const current = JSON.parse(await readFile(join(directory, 'capability.json'), 'utf-8'));
    expect(current.version).toBe(3);

    const files = (await readdir(directory)).sort();
    expect(files).toEqual(['capability.json', 'capability.v1.json', 'capability.v2.json']);

    // The archive holds the older recording, not a copy of the newest one.
    const archived = JSON.parse(await readFile(join(directory, 'capability.v1.json'), 'utf-8'));
    expect(archived.version).toBe(1);
  });
});
