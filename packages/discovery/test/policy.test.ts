import { describe, test, expect, vi } from 'vitest';
import type { ModelProvider, ModelTurn, ToolCall } from '@understudy/model-provider';
import type { Observation, Policy } from '@understudy/schemas';
import type { Surface } from '@understudy/surface';
import { discover } from '../src/discovery.js';

// Carries e1 because discovery only accepts an elementRef it actually handed out in the
// latest observation; acting on an element the model was never shown is refused.
const observationWithOneField: Observation = {
  url: 'http://localhost:3000',
  pageTitle: 'Test',
  elements: [
    {
      elementRef: 'e1',
      role: 'textbox',
      accessibleName: 'Field',
      isEnabled: true,
      isVisible: true,
    },
  ],
  capturedAt: '2026-09-17T00:00:00.000Z',
};

function makeSurface(): Surface {
  return {
    observe: vi.fn<() => Promise<Observation>>().mockResolvedValue(observationWithOneField),
    act: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue({ rungIndex: 0, rung: { strategy: 'css', selector: '#x' }, matchCount: 1 }),
    extractText: vi.fn().mockResolvedValue({ text: 'hello', resolveResult: { rungIndex: 0 } }),
    pageUrl: vi.fn().mockResolvedValue('http://localhost:3000'),
    hasText: vi.fn().mockResolvedValue(false),
  };
}

// discover() always opens by navigating to startUrl itself, so every count here
// is of what the model did afterwards — the opening navigate is not its doing.
function modelActionCalls(surface: Surface): unknown[] {
  return vi.mocked(surface.act).mock.calls.slice(1);
}

function modelActionEntries(runLog: { entries: { entryType: string; actor: string }[] }) {
  return runLog.entries.filter((e) => e.entryType === 'action' && e.actor === 'model');
}

function makeModelProvider(turns: ModelTurn[]): ModelProvider {
  let callIndex = 0;
  return {
    modelId: 'test-model',
    completeWithTools: vi.fn(async () => {
      const turn = turns[callIndex];
      if (!turn) throw new Error('No more model turns configured');
      callIndex++;
      return turn;
    }),
  };
}

function modelTurn(toolCalls: ToolCall[]): ModelTurn {
  return {
    rationale: null,
    toolCalls,
    stopReason: 'tool_use',
    inputTokens: 0,
    outputTokens: 0,
  };
}

function finishTurn(): ModelTurn {
  return modelTurn([{
    toolCallId: 'finish-1',
    toolName: 'finish',
    input: { success: true, summary: 'Done' },
  }]);
}

const basePolicy: Policy = {
  policyId: 'test-policy',
  name: 'Test Policy',
  allowedOrigins: ['http://localhost:3000'],
  rules: [
    { actionClass: 'read', decision: 'allow' },
    { actionClass: 'navigate', decision: 'allow' },
    { actionClass: 'mutate', decision: 'confirm' },
  ],
  redactedFieldNames: [],
  redactedPatterns: [],
  maxStepsPerRun: 30,
};

describe('policy enforcement during discovery', () => {
  test('off-allowlist navigation is denied and logged as a policy event', async () => {
    const surface = makeSurface();
    const modelProvider = makeModelProvider([
      modelTurn([{
        toolCallId: 'act-1',
        toolName: 'act',
        input: { actionType: 'navigate', url: 'http://evil.example.com/steal' },
      }]),
      finishTurn(),
    ]);

    const { runLog } = await discover({
      goal: 'test',
      startUrl: 'http://localhost:3000',
      surface,
      modelProvider,
      policy: basePolicy,
    });

    const policyEntries = runLog.entries.filter((e) => e.entryType === 'policy_decision');
    expect(policyEntries).toHaveLength(1);
    expect(policyEntries[0]!.decision).toBe('deny');
    expect(policyEntries[0]!.reason).toContain('outside the allowed origins');

    const actionEntries = modelActionEntries(runLog);
    expect(actionEntries).toHaveLength(1);
    expect(actionEntries[0]!.succeeded).toBe(false);

    expect(modelActionCalls(surface)).toHaveLength(0);
  });

  test('mutating action with confirm policy and no callback is denied', async () => {
    const surface = makeSurface();
    const modelProvider = makeModelProvider([
      modelTurn([{
        toolCallId: 'act-1',
        toolName: 'act',
        input: { actionType: 'fill', elementRef: 'e1', value: 'secret' },
      }]),
      finishTurn(),
    ]);

    const { runLog } = await discover({
      goal: 'test',
      startUrl: 'http://localhost:3000',
      surface,
      modelProvider,
      policy: basePolicy,
    });

    const policyEntries = runLog.entries.filter((e) => e.entryType === 'policy_decision');
    expect(policyEntries).toHaveLength(1);
    expect(policyEntries[0]!.decision).toBe('confirm');

    const actionEntries = modelActionEntries(runLog);
    expect(actionEntries).toHaveLength(1);
    expect(actionEntries[0]!.succeeded).toBe(false);

    expect(modelActionCalls(surface)).toHaveLength(0);
  });

  test('mutating action with confirm policy and rejected callback is denied', async () => {
    const surface = makeSurface();
    const onConfirmAction = vi.fn().mockResolvedValue(false);
    const modelProvider = makeModelProvider([
      modelTurn([{
        toolCallId: 'act-1',
        toolName: 'act',
        input: { actionType: 'fill', elementRef: 'e1', value: 'secret' },
      }]),
      finishTurn(),
    ]);

    const { runLog } = await discover({
      goal: 'test',
      startUrl: 'http://localhost:3000',
      surface,
      modelProvider,
      policy: basePolicy,
      onConfirmAction,
    });

    expect(onConfirmAction).toHaveBeenCalledOnce();
    expect(onConfirmAction).toHaveBeenCalledWith({
      action: expect.objectContaining({ actionType: 'fill' }),
      actionClass: 'mutate',
      reason: expect.stringContaining('confirm'),
    });

    const actionEntries = modelActionEntries(runLog);
    expect(actionEntries).toHaveLength(1);
    expect(actionEntries[0]!.succeeded).toBe(false);

    expect(modelActionCalls(surface)).toHaveLength(0);
  });

  test('mutating action with confirm policy and approved callback proceeds', async () => {
    const surface = makeSurface();
    const onConfirmAction = vi.fn().mockResolvedValue(true);
    const modelProvider = makeModelProvider([
      modelTurn([{
        toolCallId: 'act-1',
        toolName: 'act',
        input: { actionType: 'fill', elementRef: 'e1', value: 'John' },
      }]),
      finishTurn(),
    ]);

    const { runLog } = await discover({
      goal: 'test',
      startUrl: 'http://localhost:3000',
      surface,
      modelProvider,
      policy: basePolicy,
      onConfirmAction,
    });

    expect(onConfirmAction).toHaveBeenCalledOnce();

    const actionEntries = modelActionEntries(runLog);
    expect(actionEntries).toHaveLength(1);
    expect(actionEntries[0]!.succeeded).toBe(true);

    expect(modelActionCalls(surface)).toHaveLength(1);
  });

  test('read actions are allowed without confirmation', async () => {
    const surface = makeSurface();
    const onConfirmAction = vi.fn();
    const modelProvider = makeModelProvider([
      modelTurn([{
        toolCallId: 'act-1',
        toolName: 'act',
        input: { actionType: 'click', elementRef: 'e1' },
      }]),
      finishTurn(),
    ]);

    const { runLog } = await discover({
      goal: 'test',
      startUrl: 'http://localhost:3000',
      surface,
      modelProvider,
      policy: basePolicy,
      onConfirmAction,
    });

    expect(onConfirmAction).not.toHaveBeenCalled();

    const policyEntries = runLog.entries.filter((e) => e.entryType === 'policy_decision');
    expect(policyEntries).toHaveLength(1);
    expect(policyEntries[0]!.decision).toBe('allow');

    expect(modelActionCalls(surface)).toHaveLength(1);
  });

  test('allowed-origin navigation proceeds without confirmation', async () => {
    const surface = makeSurface();
    const onConfirmAction = vi.fn();
    const modelProvider = makeModelProvider([
      modelTurn([{
        toolCallId: 'act-1',
        toolName: 'act',
        input: { actionType: 'navigate', url: 'http://localhost:3000/dashboard' },
      }]),
      finishTurn(),
    ]);

    await discover({
      goal: 'test',
      startUrl: 'http://localhost:3000',
      surface,
      modelProvider,
      policy: basePolicy,
      onConfirmAction,
    });

    expect(onConfirmAction).not.toHaveBeenCalled();
    expect(modelActionCalls(surface)).toHaveLength(1);
  });
});
