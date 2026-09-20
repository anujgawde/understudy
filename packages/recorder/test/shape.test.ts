import { describe, test, expect, vi } from 'vitest';
import type { ModelProvider, ModelTurn } from '@understudy/model-provider';
import { Capability } from '@understudy/schemas';
import { shapeBusinessOutcomes } from '../src/shape.js';

const capability: Capability = {
  capabilityId: 'lookup-savings-balance',
  name: 'Look up savings',
  version: 1,
  goal: 'Look up member 100234 and read their regular savings balance',
  status: 'approved',
  inputs: [{ name: 'memberNumber', valueType: 'string', required: true, secret: false }],
  outputs: [{ name: 'regularSavings', valueType: 'number', required: true }],
  steps: [
    {
      stepId: 'click-search',
      action: { actionType: 'click', target: [{ strategy: 'css', selector: '#search' }] },
    },
  ],
  checkpoints: [
    {
      checkpointId: 'results-present',
      afterStepId: 'click-search',
      allOf: [{ assert: 'element_present', target: [{ strategy: 'css', selector: '#balance' }] }],
    },
  ],
  extractions: [
    {
      outputName: 'regularSavings',
      target: [{ strategy: 'css', selector: '#balance' }],
      valueType: 'number',
    },
  ],
  businessOutcomes: [],
};

function respondingWith(outcomes: unknown): ModelProvider {
  return {
    modelId: 'test-model',
    completeWithTools: vi.fn<() => Promise<ModelTurn>>().mockResolvedValue({
      rationale: null,
      toolCalls: [
        {
          toolCallId: 'shape-1',
          toolName: 'proposeBusinessOutcomes',
          input: { outcomes },
        },
      ],
      stopReason: 'tool_use',
      inputTokens: 0,
      outputTokens: 0,
    }),
  };
}

describe('Shaping business outcomes', () => {
  test('a named outcome becomes a rule keyed on the checkpoint that would fail', async () => {
    const rules = await shapeBusinessOutcomes(
      capability,
      respondingWith([
        {
          checkpointId: 'results-present',
          code: 'member_not_found',
          message: 'No member matched that member number.',
        },
      ]),
    );

    expect(rules).toEqual([
      {
        code: 'member_not_found',
        message: 'No member matched that member number.',
        condition: { when: 'checkpoint_failed', checkpointId: 'results-present' },
      },
    ]);

    // The rule has to survive the artifact's own cross-reference check, which is
    // what would otherwise reject the whole capability at write time.
    expect(() => Capability.parse({ ...capability, businessOutcomes: rules })).not.toThrow();
  });

  test('an outcome naming a checkpoint that does not exist is dropped, not kept', async () => {
    // The schema rejects the entire capability over one dangling reference, so
    // letting an invented id through would cost the whole artifact.
    const rules = await shapeBusinessOutcomes(
      capability,
      respondingWith([
        { checkpointId: 'imagined', code: 'nope', message: 'Never happened.' },
        {
          checkpointId: 'results-present',
          code: 'member_not_found',
          message: 'No member matched that member number.',
        },
      ]),
    );

    expect(rules.map((rule) => rule.code)).toEqual(['member_not_found']);
  });

  test('malformed entries are skipped without losing the well-formed ones', async () => {
    const rules = await shapeBusinessOutcomes(
      capability,
      respondingWith([
        null,
        'not an object',
        { checkpointId: 'results-present', code: 'missing_message' },
        {
          checkpointId: 'results-present',
          code: 'member_not_found',
          message: 'No member matched that member number.',
        },
        // A second rule on the same code would make the outcome ambiguous.
        {
          checkpointId: 'results-present',
          code: 'member_not_found',
          message: 'Duplicate.',
        },
      ]),
    );

    expect(rules.map((rule) => rule.code)).toEqual(['member_not_found']);
  });

  test('a capability with no checkpoints does not spend a model call', async () => {
    const modelProvider = respondingWith([]);

    const rules = await shapeBusinessOutcomes({ ...capability, checkpoints: [] }, modelProvider);

    expect(rules).toEqual([]);
    expect(modelProvider.completeWithTools).not.toHaveBeenCalled();
  });

  test('a model that answers without calling the tool yields no rules', async () => {
    const rules = await shapeBusinessOutcomes(capability, {
      modelId: 'test-model',
      completeWithTools: vi.fn<() => Promise<ModelTurn>>().mockResolvedValue({
        rationale: 'I am not sure.',
        toolCalls: [],
        stopReason: 'end_turn',
        inputTokens: 0,
        outputTokens: 0,
      }),
    });

    expect(rules).toEqual([]);
  });
});
