import type {
  ConversationMessage,
  ToolCall,
  ToolResult,
} from '@understudy/model-provider';
import type {
  Action,
  ActionClass,
  Observation,
  Policy,
  PolicyDecision,
  RunLog,
  RunLogEntry,
} from '@understudy/schemas';
import { namesIrreversibleControl } from '@understudy/schemas';
import type { Surface } from '@understudy/surface';
import { buildSystemPrompt } from './prompt.js';
import { discoveryTools } from './tools.js';
import type {
  DiscoveryOptions,
  DiscoveryResult,
  FinishPayload,
  ToolCallResult,
} from './types.js';

/**
 * What the action can commit, which is the question the allowlist is actually
 * asking. Classifying every click as a read was the hole: "Post Transaction"
 * and "Back to Search" are the same DOM event and could not be more different,
 * and only the first one needs asking about.
 *
 * A fill stays a mutation. It looks inert, but on the server-rendered admin
 * screens this system targets a field can post back as it loses focus, and a
 * staged amount or account number is a change waiting to be committed either
 * way. Treating it as a read to match the click fix would trade one wrong
 * default for another, in the unsafe direction.
 */
function classifyAction(action: Action, policy: Policy | undefined, label: string | undefined): ActionClass {
  switch (action.actionType) {
    case 'navigate':
      return 'navigate';
    case 'click':
      return policy && namesIrreversibleControl(policy, [label]) ? 'mutate' : 'read';
    case 'fill':
      return 'mutate';
  }
}

// The names the latest observation knows this element by, which is where the
// evidence that a button commits something actually lives.
function elementNames(entries: RunLogEntry[], elementRef: string | undefined): string | undefined {
  if (elementRef === undefined) return undefined;

  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry?.entryType !== 'observation') continue;

    const element = entry.observation.elements.find(
      (candidate) => candidate.elementRef === elementRef,
    );
    if (!element) return undefined;

    return [element.accessibleName, element.domId, element.testId, ...(element.nearbyText ?? [])]
      .filter(Boolean)
      .join(' ');
  }

  return undefined;
}

/**
 * Swaps "{{name}}" for the value on the way to the page, and nowhere else. The
 * action recorded in the run log keeps the placeholder, so a credential the
 * model typed is never written down — and the recorder receives a step that is
 * already parameterised rather than one it has to infer a parameter from.
 */
function resolvePlaceholders(action: Action, inputs: Record<string, string>): Action {
  if (action.actionType !== 'fill') return action;

  const value = action.value.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    inputs[name] ?? whole,
  );

  return { ...action, value };
}

function checkPolicy(
  policy: Policy,
  action: Action,
  actionClass: ActionClass,
): { decision: PolicyDecision; reason: string } {
  if (action.actionType === 'navigate') {
    try {
      const targetOrigin = new URL(action.url).origin;
      if (!policy.allowedOrigins.some((allowed) => new URL(allowed).origin === targetOrigin)) {
        return {
          decision: 'deny',
          reason: `Navigation to ${targetOrigin} is outside the allowed origins`,
        };
      }
    } catch {
      return { decision: 'deny', reason: `Invalid URL: ${action.url}` };
    }
  }

  for (const rule of policy.rules) {
    if (rule.actionClass === actionClass) {
      return {
        decision: rule.decision,
        reason: `Policy rule: ${actionClass} actions are ${rule.decision}ed`,
      };
    }
  }

  return { decision: 'allow', reason: 'No matching policy rule; default allow' };
}

function formatObservation(observation: Observation): string {
  const lines = [
    `URL: ${observation.url}`,
    `Title: ${observation.pageTitle}`,
    `Elements (${observation.elements.length}) — pass the ref= value to act and extract:`,
  ];

  for (const element of observation.elements) {
    if (!element.isVisible) continue;

    // domId is shown unprefixed on purpose: a leading "#" reads as a CSS selector and
    // invites the model to send it where the ref belongs.
    let description = `  ref=${element.elementRef} ${element.role}`;
    if (element.accessibleName) description += ` "${element.accessibleName}"`;
    if (element.currentValue !== undefined) description += ` value="${element.currentValue}"`;
    if (!element.isEnabled) description += ' (disabled)';
    if (element.domId) description += ` domId=${element.domId}`;
    if (element.nearbyText && element.nearbyText.length > 0) {
      description += ` nearby:[${element.nearbyText.join(', ')}]`;
    }
    lines.push(description);
  }

  return lines.join('\n');
}

function elementRefToCssSelector(elementRef: string): string {
  return `[data-understudy-ref="${elementRef}"]`;
}

function visibleElementRefs(entries: RunLogEntry[]): string[] {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry?.entryType === 'observation') {
      return entry.observation.elements
        .filter((element) => element.isVisible)
        .map((element) => element.elementRef);
    }
  }
  return [];
}

function buildActionFromToolInput(input: Record<string, unknown>, validRefs: string[]): Action {
  const actionType = input['actionType'] as string;

  if (actionType === 'navigate') {
    return {
      actionType: 'navigate',
      url: input['url'] as string,
    };
  }

  if (actionType !== 'click' && actionType !== 'fill') {
    throw new Error(`Unknown actionType: ${actionType}`);
  }

  // Without this the ref goes straight into a selector, so a wrong one becomes
  // [data-understudy-ref="<whatever>"] and fails as a timeout with nothing the model can act on.
  const elementRef = input['elementRef'] as string;
  if (!validRefs.includes(elementRef)) {
    throw new Error(
      `elementRef "${elementRef}" is not from the latest observation. Pass one of these exactly ` +
        `as written: ${validRefs.join(', ')}. A domId or a CSS selector will not work here.`,
    );
  }

  const target = [{ strategy: 'css' as const, selector: elementRefToCssSelector(elementRef) }];
  return actionType === 'click'
    ? { actionType: 'click', target }
    : { actionType: 'fill', target, value: input['value'] as string };
}

export async function discover(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const { goal, startUrl, surface, modelProvider, policy, onEntry, onConfirmAction } = options;
  const inputs = options.inputs ?? {};
  const maxSteps = options.maxSteps ?? policy?.maxStepsPerRun ?? 30;
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const entries: RunLogEntry[] = [];
  let sequence = 0;

  function addEntry(entry: RunLogEntry): void {
    entries.push(entry);
    onEntry?.(entry);
  }

  const systemPrompt = buildSystemPrompt(goal, startUrl, Object.keys(inputs));
  const messages: ConversationMessage[] = [];
  let stepCount = 0;
  let finishPayload: FinishPayload | null = null;

  // Initial observation. The browser opens on about:blank, so this is the state
  // before anyone has gone anywhere — logged because the navigate below is a
  // replayable step, and distillation needs the observation it acted from.
  const initialObservation = await surface.observe();
  addEntry({
    entryType: 'observation',
    sequence: sequence++,
    occurredAt: new Date().toISOString(),
    actor: 'system',
    observation: initialObservation,
  });

  // Getting to the start URL is not a decision worth a model call, and leaving it
  // to the model meant the first thing we ever told it was false: it was sitting
  // on about:blank while being informed it had arrived.
  const openingAction: Action = { actionType: 'navigate', url: startUrl };
  await surface.act(openingAction, { waitUntil: 'pageLoad' });
  addEntry({
    entryType: 'action',
    sequence: sequence++,
    occurredAt: new Date().toISOString(),
    actor: 'system',
    action: openingAction,
    succeeded: true,
  });

  const startObservation = await surface.observe();
  addEntry({
    entryType: 'observation',
    sequence: sequence++,
    occurredAt: new Date().toISOString(),
    actor: 'system',
    observation: startObservation,
  });

  messages.push({
    role: 'user',
    content: `I have navigated to the starting page. Here is the initial observation:\n\n${formatObservation(startObservation)}`,
  });

  while (stepCount < maxSteps && finishPayload === null) {
    const turn = await modelProvider.completeWithTools({
      system: systemPrompt,
      messages,
      tools: discoveryTools,
    });

    if (turn.rationale) {
      addEntry({
        entryType: 'rationale',
        sequence: sequence++,
        occurredAt: new Date().toISOString(),
        actor: 'model',
        text: turn.rationale,
      });
    }

    if (turn.toolCalls.length === 0) {
      messages.push({
        role: 'assistant',
        rationale: turn.rationale,
        toolCalls: [],
      });
      messages.push({
        role: 'user',
        content: 'You did not call any tools. Please use the observe, act, extract, or finish tool to make progress toward the goal.',
      });
      stepCount++;
      continue;
    }

    messages.push({
      role: 'assistant',
      rationale: turn.rationale,
      toolCalls: turn.toolCalls,
    });

    const toolResults: ToolResult[] = [];

    for (const toolCall of turn.toolCalls) {
      const result = await executeToolCall(
        toolCall,
        surface,
        policy,
        entries,
        sequence,
        addEntry,
        inputs,
        onConfirmAction,
      );
      sequence = result.nextSequence;
      toolResults.push(result.toolResult);

      if (result.finishPayload) {
        finishPayload = result.finishPayload;
        break;
      }

      stepCount++;
      if (stepCount >= maxSteps) break;
    }

    messages.push({ role: 'user', content: toolResults });
  }

  if (finishPayload === null && stepCount >= maxSteps) {
    addEntry({
      entryType: 'rationale',
      sequence: sequence++,
      occurredAt: new Date().toISOString(),
      actor: 'system',
      text: `Step budget exhausted (${maxSteps} steps). Stopping discovery.`,
    });
  }

  const outcome = buildOutcome(finishPayload, stepCount >= maxSteps);

  const runLog: RunLog = {
    runId,
    mode: 'discovery',
    goal,
    inputs,
    startedAt,
    completedAt: new Date().toISOString(),
    entries,
    outcome,
  };

  return { runLog };
}

async function executeToolCall(
  toolCall: ToolCall,
  surface: Surface,
  policy: Policy | undefined,
  entries: RunLogEntry[],
  sequence: number,
  addEntry: (entry: RunLogEntry) => void,
  inputs: Record<string, string>,
  onConfirmAction?: DiscoveryOptions['onConfirmAction'],
): Promise<ToolCallResult> {
  switch (toolCall.toolName) {
    case 'observe':
      return handleObserve(toolCall, surface, sequence, addEntry);

    case 'act':
      return handleAct(
        toolCall,
        surface,
        policy,
        entries,
        sequence,
        addEntry,
        inputs,
        onConfirmAction,
      );

    case 'extract':
      return handleExtract(toolCall, surface, entries, sequence, addEntry);

    case 'finish':
      return handleFinish(toolCall, sequence);

    default:
      return {
        toolResult: {
          toolCallId: toolCall.toolCallId,
          content: `Unknown tool: ${toolCall.toolName}`,
          isError: true,
        },
        nextSequence: sequence,
        finishPayload: null,
      };
  }
}

async function handleObserve(
  toolCall: ToolCall,
  surface: Surface,
  sequence: number,
  addEntry: (entry: RunLogEntry) => void,
): Promise<ToolCallResult> {
  const observation = await surface.observe();

  addEntry({
    entryType: 'observation',
    sequence: sequence++,
    occurredAt: new Date().toISOString(),
    actor: 'model',
    observation,
  });

  return {
    toolResult: {
      toolCallId: toolCall.toolCallId,
      content: formatObservation(observation),
    },
    nextSequence: sequence,
    finishPayload: null,
  };
}

async function handleAct(
  toolCall: ToolCall,
  surface: Surface,
  policy: Policy | undefined,
  entries: RunLogEntry[],
  sequence: number,
  addEntry: (entry: RunLogEntry) => void,
  inputs: Record<string, string>,
  onConfirmAction?: DiscoveryOptions['onConfirmAction'],
): Promise<ToolCallResult> {
  let action: Action;
  try {
    action = buildActionFromToolInput(toolCall.input, visibleElementRefs(entries));
  } catch (error) {
    return {
      toolResult: {
        toolCallId: toolCall.toolCallId,
        content: `Invalid action input: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      },
      nextSequence: sequence,
      finishPayload: null,
    };
  }

  const actionClass = classifyAction(
    action,
    policy,
    elementNames(entries, toolCall.input['elementRef'] as string | undefined),
  );

  if (policy) {
    const policyResult = checkPolicy(policy, action, actionClass);

    addEntry({
      entryType: 'policy_decision',
      sequence: sequence++,
      occurredAt: new Date().toISOString(),
      actor: 'system',
      actionClass,
      decision: policyResult.decision,
      reason: policyResult.reason,
    });

    if (policyResult.decision === 'deny') {
      addEntry({
        entryType: 'action',
        sequence: sequence++,
        occurredAt: new Date().toISOString(),
        actor: 'model',
        action,
        succeeded: false,
      });

      return {
        toolResult: {
          toolCallId: toolCall.toolCallId,
          content: `Policy denied this action: ${policyResult.reason}. Choose a different approach.`,
          isError: true,
        },
        nextSequence: sequence,
        finishPayload: null,
      };
    }

    if (policyResult.decision === 'confirm') {
      const approved = onConfirmAction
        ? await onConfirmAction({ action, actionClass, reason: policyResult.reason })
        : false;

      if (!approved) {
        addEntry({
          entryType: 'action',
          sequence: sequence++,
          occurredAt: new Date().toISOString(),
          actor: 'model',
          action,
          succeeded: false,
        });

        return {
          toolResult: {
            toolCallId: toolCall.toolCallId,
            content: `Action requires confirmation and was ${onConfirmAction ? 'rejected by the operator' : 'denied (no confirmation handler)'}. Choose a different approach.`,
            isError: true,
          },
          nextSequence: sequence,
          finishPayload: null,
        };
      }
    }
  }

  try {
    await surface.act(resolvePlaceholders(action, inputs));
  } catch (error) {
    addEntry({
      entryType: 'action',
      sequence: sequence++,
      occurredAt: new Date().toISOString(),
      actor: 'model',
      action,
      succeeded: false,
    });

    return {
      toolResult: {
        toolCallId: toolCall.toolCallId,
        content: `Action failed: ${error instanceof Error ? error.message : String(error)}. Re-observe and try a different approach.`,
        isError: true,
      },
      nextSequence: sequence,
      finishPayload: null,
    };
  }

  addEntry({
    entryType: 'action',
    sequence: sequence++,
    occurredAt: new Date().toISOString(),
    actor: 'model',
    action,
    succeeded: true,
  });

  // Auto re-observe after every action
  const postActionObservation = await surface.observe();

  addEntry({
    entryType: 'observation',
    sequence: sequence++,
    occurredAt: new Date().toISOString(),
    actor: 'system',
    observation: postActionObservation,
  });

  return {
    toolResult: {
      toolCallId: toolCall.toolCallId,
      content: `Action succeeded. Updated page state:\n\n${formatObservation(postActionObservation)}`,
    },
    nextSequence: sequence,
    finishPayload: null,
  };
}

async function handleExtract(
  toolCall: ToolCall,
  surface: Surface,
  entries: RunLogEntry[],
  sequence: number,
  addEntry: (entry: RunLogEntry) => void,
): Promise<ToolCallResult> {
  const elementRef = toolCall.input['elementRef'] as string;
  const validRefs = visibleElementRefs(entries);
  if (!validRefs.includes(elementRef)) {
    return {
      toolResult: {
        toolCallId: toolCall.toolCallId,
        content:
          `elementRef "${elementRef}" is not from the latest observation. Pass one of these ` +
          `exactly as written: ${validRefs.join(', ')}. A domId or a CSS selector will not work here.`,
        isError: true,
      },
      nextSequence: sequence,
      finishPayload: null,
    };
  }

  const cssSelector = elementRefToCssSelector(elementRef);

  try {
    const { text } = await surface.extractText([{ strategy: 'css', selector: cssSelector }]);

    addEntry({
      entryType: 'extraction',
      sequence: sequence++,
      occurredAt: new Date().toISOString(),
      actor: 'model',
      outputName: elementRef,
      rawValue: text,
      coerced: false,
    });

    return {
      toolResult: {
        toolCallId: toolCall.toolCallId,
        content: `Extracted text: "${text}"`,
      },
      nextSequence: sequence,
      finishPayload: null,
    };
  } catch (error) {
    return {
      toolResult: {
        toolCallId: toolCall.toolCallId,
        content: `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      },
      nextSequence: sequence,
      finishPayload: null,
    };
  }
}

function handleFinish(
  toolCall: ToolCall,
  sequence: number,
): ToolCallResult {
  const input = toolCall.input;

  const payload: FinishPayload = {
    success: input['success'] as boolean,
    outputs: (input['outputs'] as Record<string, string> | undefined) ?? {},
    businessOutcomeCode: input['businessOutcomeCode'] as string | undefined,
    summary: input['summary'] as string,
  };

  return {
    toolResult: {
      toolCallId: toolCall.toolCallId,
      content: 'Discovery complete.',
    },
    nextSequence: sequence,
    finishPayload: payload,
  };
}

function buildOutcome(
  finishPayload: FinishPayload | null,
  budgetExhausted: boolean,
): RunLog['outcome'] {
  if (finishPayload === null) {
    if (budgetExhausted) {
      return {
        classification: 'failed',
        failureCode: 'step_budget_exhausted',
        message: 'Discovery stopped: step budget exhausted before the model called finish.',
        recoveries: [],
        interventionRaised: false,
      };
    }
    return {
      classification: 'failed',
      failureCode: 'timeout',
      message: 'Discovery ended without the model calling finish.',
      recoveries: [],
      interventionRaised: false,
    };
  }

  if (finishPayload.success) {
    return {
      classification: 'success',
      outputs: finishPayload.outputs ?? {},
    };
  }

  return {
    classification: 'business_outcome',
    code: finishPayload.businessOutcomeCode ?? 'unknown',
    message: finishPayload.summary,
  };
}
