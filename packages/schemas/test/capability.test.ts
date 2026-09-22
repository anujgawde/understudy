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

  it('carries the outcome signals and the default risk on every step', () => {
    const capability = Capability.parse(exampleArtifact);

    // Two outcomes stop on the same step with the same failure code and are
    // told apart only by what the page says. That is the whole mechanism.
    const onDetailStep = capability.businessOutcomes.filter(
      (rule) =>
        rule.condition.when === 'step_failed' && rule.condition.stepId === 'open-member-detail',
    );
    expect(onDetailStep).toHaveLength(2);
    expect(new Set(onDetailStep.map((rule) => rule.signal.assert))).toEqual(
      new Set(['text_present']),
    );

    expect(capability.steps.every((step) => step.risk === 'reversible')).toBe(true);
  });

  it('rejects a business outcome whose signal is an absence', () => {
    const base = exampleArtifact as Record<string, unknown>;
    const invalid = {
      ...base,
      businessOutcomes: [
        {
          code: 'member_not_found',
          message: 'No member matched that member number.',
          signal: { assert: 'text_absent', text: 'Share Summary' },
          condition: {
            when: 'step_failed',
            stepId: 'open-member-detail',
            failureCode: 'locator_not_found',
          },
        },
      ],
    };

    const result = Capability.safeParse(invalid);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('positively shows');
  });

  it('rejects a business outcome with no signal at all', () => {
    const base = exampleArtifact as Record<string, unknown>;
    const invalid = {
      ...base,
      businessOutcomes: [
        {
          code: 'member_not_found',
          message: 'No member matched that member number.',
          condition: {
            when: 'step_failed',
            stepId: 'open-member-detail',
            failureCode: 'locator_not_found',
          },
        },
      ],
    };

    expect(Capability.safeParse(invalid).success).toBe(false);
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

  it('rejects a step that fills a placeholder naming no declared input', () => {
    const invalid = {
      ...(exampleArtifact as Record<string, unknown>),
      checkpoints: [],
      businessOutcomes: [],
      steps: [
        {
          stepId: 'fill-unknown',
          action: {
            actionType: 'fill',
            target: [{ strategy: 'css', selector: '#anything' }],
            value: '{{nowhereDeclared}}',
          },
        },
      ],
    };
    const result = Capability.safeParse(invalid);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('not a declared input');
  });

  it('rejects a placeholder in a locator, which replay never substitutes', () => {
    const invalid = {
      ...(exampleArtifact as Record<string, unknown>),
      checkpoints: [],
      businessOutcomes: [],
      steps: [
        {
          stepId: 'click-by-input',
          action: {
            actionType: 'click',
            target: [{ strategy: 'text', text: '{{memberNumber}}' }],
          },
        },
      ],
    };
    const result = Capability.safeParse(invalid);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('does not substitute inputs');
  });
});
