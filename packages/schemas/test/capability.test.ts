import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Capability } from '../src/index';

const exampleArtifact: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../examples/lookup-savings-balance.capability.json', import.meta.url)),
    'utf8',
  ),
);

describe('Capability', () => {
  it('parses the hand-written example artifact', () => {
    const capability = Capability.parse(exampleArtifact);
    expect(capability.capabilityId).toBe('lookup-savings-balance');
    expect(capability.steps).toHaveLength(7);
    expect(capability.status).toBe('draft');
  });

  it('rejects a capability with no steps', () => {
    const invalid = { ...(exampleArtifact as Record<string, unknown>), steps: [] };
    expect(Capability.safeParse(invalid).success).toBe(false);
  });

  it('rejects an extraction that writes to an undeclared output', () => {
    const invalid = {
      ...(exampleArtifact as Record<string, unknown>),
      extractions: [
        {
          outputName: 'undeclaredField',
          target: [{ strategy: 'css', selector: '#anything' }],
          valueType: 'string',
        },
      ],
    };
    const result = Capability.safeParse(invalid);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('not a declared output');
  });

  it('rejects a checkpoint anchored to a step that does not exist', () => {
    const invalid = {
      ...(exampleArtifact as Record<string, unknown>),
      checkpoints: [
        {
          checkpointId: 'dangling',
          afterStepId: 'no-such-step',
          allOf: [{ assert: 'text_present', text: 'anything' }],
        },
      ],
    };
    const result = Capability.safeParse(invalid);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('not a step in this capability');
  });
});
