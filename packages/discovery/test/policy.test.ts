import { describe, test, expect, vi } from 'vitest';
import type { ModelProvider, ModelTurn, ToolCall } from '@understudy/model-provider';
import type { Observation, Policy, RunLog, RunLogEntry } from '@understudy/schemas';
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
    drainDialogs: vi.fn().mockResolvedValue([]),
    lastResponseStatus: vi.fn().mockReturnValue(200),
    clearResponseStatus: vi.fn(),
  };
}

// discover() always opens by navigating to startUrl itself, so every count here
// is of what the model did afterwards — the opening navigate is not its doing.
function modelActionCalls(surface: Surface): unknown[] {
  return vi.mocked(surface.act).mock.calls.slice(1);
}

function modelActionEntries(runLog: RunLog) {
  return runLog.entries.filter(
    (entry): entry is Extract<RunLogEntry, { entryType: 'action' }> =>
      entry.entryType === 'action' && entry.actor === 'model',
  );
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
  irreversibleControlLabels: ['post', 'transfer', 'confirm'],
  redactedPatterns: [],
  maxStepsPerRun: 30,
  allowedPathPrefixes: [],
  maxRunSeconds: 600,
};

describe('policy enforcement during discovery', () => {
  test('a route outside the allowed prefixes is denied even on the right origin', async () => {
    // An origin allowlist permits the whole application. On a back-office
    // system that includes the screens this task was never authorised to open.
    const surface = makeSurface();
    const modelProvider = makeModelProvider([
      modelTurn([{
        toolCallId: 'act-1',
        toolName: 'act',
        input: { actionType: 'navigate', url: 'http://localhost:3000/admin/users' },
      }]),
      finishTurn(),
    ]);

    const { runLog } = await discover({
      goal: 'test',
      startUrl: 'http://localhost:3000',
      surface,
      modelProvider,
      policy: { ...basePolicy, allowedPathPrefixes: ['/members'] },
    });

    const denials = runLog.entries.filter(
      (entry) => entry.entryType === 'policy_decision' && entry.decision === 'deny',
    );
    expect(denials).toHaveLength(1);
    expect(denials[0]!.entryType === 'policy_decision' && denials[0]!.reason).toContain(
      'outside the allowed routes',
    );
    expect(modelActionCalls(surface)).toHaveLength(0);
  });

  test('an allowed route on the allowed origin goes through', async () => {
    const surface = makeSurface();
    const modelProvider = makeModelProvider([
      modelTurn([{
        toolCallId: 'act-1',
        toolName: 'act',
        input: { actionType: 'navigate', url: 'http://localhost:3000/members/search' },
      }]),
      finishTurn(),
    ]);

    await discover({
      goal: 'test',
      startUrl: 'http://localhost:3000',
      surface,
      modelProvider,
      policy: { ...basePolicy, allowedPathPrefixes: ['/members'] },
    });

    expect(modelActionCalls(surface)).toHaveLength(1);
  });

  test('a run that outlives its time budget stops as a timeout, not a step budget', async () => {
    // The step budget counts what the model tried. This counts how long it was
    // allowed to take, which is the stopping condition a hanging page trips.
    const surface = makeSurface();
    const slowProvider: ModelProvider = {
      modelId: 'slow-test-model',
      completeWithTools: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
        return modelTurn([{
          toolCallId: 'act-1',
          toolName: 'act',
          input: { actionType: 'navigate', url: 'http://localhost:3000/members/search' },
        }]);
      },
    };

    const { runLog } = await discover({
      goal: 'test',
      startUrl: 'http://localhost:3000',
      surface,
      modelProvider: slowProvider,
      policy: { ...basePolicy, maxRunSeconds: 1 },
    });

    expect(runLog.outcome?.classification).toBe('failed');
    if (runLog.outcome?.classification === 'failed') {
      expect(runLog.outcome.failureCode).toBe('timeout');
      expect(runLog.outcome.message).toContain('time budget');
    }
  }, 15_000);

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
