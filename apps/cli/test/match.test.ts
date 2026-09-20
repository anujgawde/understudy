import { describe, test, expect, vi } from 'vitest';
import type { ModelProvider, ModelTurn } from '@understudy/model-provider';
import type { Capability } from '@understudy/schemas';
import { matchCapability } from '../src/match.js';

const lookUpMember: Capability = {
  capabilityId: 'log-in-and-look-up-member-then-read-the-savings-balance',
  name: 'Look up savings',
  version: 1,
  // Still names the member it was discovered with. That is the point: the
  // matcher has to read past it.
  goal: 'log in and look up member 12345, then read the savings balance',
  status: 'approved',
  inputs: [
    { name: 'password', valueType: 'string', required: true, secret: true },
    { name: 'memberNo', valueType: 'string', required: true, secret: false },
  ],
  outputs: [{ name: 'currentBalance', valueType: 'number', required: true }],
  steps: [
    {
      stepId: 'click-search',
      action: { actionType: 'click', target: [{ strategy: 'css', selector: '#search' }] },
    },
  ],
  checkpoints: [],
  extractions: [],
  businessOutcomes: [],
};

function respondingWith(input: Record<string, unknown>): ModelProvider {
  return {
    modelId: 'test-model',
    completeWithTools: vi.fn<() => Promise<ModelTurn>>().mockResolvedValue({
      rationale: null,
      toolCalls: [{ toolCallId: 'match-1', toolName: 'selectCapability', input }],
      stopReason: 'tool_use',
      inputTokens: 0,
      outputTokens: 0,
    }),
  };
}

describe('Matching a request to a recorded capability', () => {
  test('a different member is the same task, and its number is bound as an input', async () => {
    const match = await matchCapability(
      'look up member 67890 and read the savings balance',
      [lookUpMember],
      respondingWith({
        capabilityId: lookUpMember.capabilityId,
        inputs: [{ name: 'memberNo', value: '67890' }],
      }),
    );

    expect(match).toEqual({
      capabilityId: lookUpMember.capabilityId,
      inputs: { memberNo: '67890' },
    });
  });

  test('an empty capabilityId means no match, which is a normal answer', async () => {
    const match = await matchCapability(
      'open a new savings account',
      [lookUpMember],
      respondingWith({ capabilityId: '' }),
    );

    expect(match).toBeNull();
  });

  test('a capability the library does not hold is refused rather than passed on', async () => {
    const match = await matchCapability(
      'look up member 67890',
      [lookUpMember],
      respondingWith({ capabilityId: 'a-capability-that-was-never-recorded' }),
    );

    expect(match).toBeNull();
  });

  test('values bound to inputs the capability never declared are dropped', async () => {
    // Replay rejects an unknown input, which would read as a broken artifact
    // rather than as a bad match.
    const match = await matchCapability(
      'look up member 67890 at the northgate branch',
      [lookUpMember],
      respondingWith({
        capabilityId: lookUpMember.capabilityId,
        inputs: [
          { name: 'memberNo', value: '67890' },
          { name: 'branch', value: 'northgate' },
        ],
      }),
    );

    expect(match?.inputs).toEqual({ memberNo: '67890' });
  });

  test('an empty library does not spend a model call', async () => {
    const modelProvider = respondingWith({ capabilityId: '' });

    const match = await matchCapability('look up member 67890', [], modelProvider);

    expect(match).toBeNull();
    expect(modelProvider.completeWithTools).not.toHaveBeenCalled();
  });

  test('a model that answers without calling the tool is treated as no match', async () => {
    const match = await matchCapability('look up member 67890', [lookUpMember], {
      modelId: 'test-model',
      completeWithTools: vi.fn<() => Promise<ModelTurn>>().mockResolvedValue({
        rationale: 'I am not sure.',
        toolCalls: [],
        stopReason: 'end_turn',
        inputTokens: 0,
        outputTokens: 0,
      }),
    });

    expect(match).toBeNull();
  });
});
