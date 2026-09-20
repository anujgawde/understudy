import type { ModelProvider } from '@understudy/model-provider';
import { BusinessOutcomeRule, type Capability } from '@understudy/schemas';

/**
 * A run log only ever contains the path that worked, so the recorder can derive
 * the *structure* of a failure — which checkpoint would stop the replay — but
 * never its *meaning*. Nothing in a successful member lookup suggests that the
 * result checkpoint failing should be reported as `member_not_found` rather
 * than as a crash, and the brief is explicit that conflating those two is the
 * most common design mistake in this problem.
 *
 * So the names come from a model, once, at record time. Replay still runs with
 * no model in the loop — that is the guarantee that matters, and it is about
 * replay, not about recording, which has already paid for a model.
 */
const proposeOutcomesTool = {
  name: 'proposeBusinessOutcomes',
  description:
    'Report which of this capability\'s checkpoints can fail for an ordinary business reason ' +
    'rather than a malfunction, and what that failure should be called.',
  inputSchema: {
    type: 'object',
    properties: {
      outcomes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            checkpointId: {
              type: 'string',
              description: 'A checkpointId from the capability, exactly as written.',
            },
            code: {
              type: 'string',
              description:
                'lower_snake_case machine code for the outcome, e.g. member_not_found. ' +
                'Names the situation, not the failed assertion.',
            },
            message: {
              type: 'string',
              description:
                'One sentence an operator reads. States what is true, e.g. ' +
                '"No member matched that member number."',
            },
          },
          required: ['checkpointId', 'code', 'message'],
        },
      },
    },
    required: ['outcomes'],
  },
};

const systemPrompt = `You label the expected, legitimate failures of an automated flow.

A capability is a recorded browser flow that was discovered once and now replays without you.
Each checkpoint asserts something that was true when the flow was discovered. At replay time a
checkpoint can fail for two very different reasons:

  - A BUSINESS OUTCOME: the flow worked correctly and the answer is simply negative. Searching
    for a member who does not exist, an account with no transactions in range, a customer who is
    not eligible. The caller asked a question and got a real answer. This is not an error.
  - A MALFUNCTION: the page changed, the site is down, a selector drifted. Nobody asked for this
    and nobody can act on it except an engineer.

Report only the first kind. For each checkpoint that can plausibly fail because of a legitimate
negative answer, give a code and a message. Skip checkpoints that can only fail when something
is broken — a login page failing to load is a malfunction, not a business outcome.

Most capabilities have one or two business outcomes. Some have none; reporting an empty list is
a valid and correct answer. Never invent an outcome for a checkpoint that is not listed.`;

function describeForShaping(capability: Capability): string {
  const steps = capability.steps.map((step) => `  ${step.stepId}: ${step.action.actionType}`);

  const checkpoints = capability.checkpoints.map((checkpoint) => {
    const asserts = checkpoint.allOf
      .map((assertion) => {
        switch (assertion.assert) {
          case 'text_present':
            return `the text "${assertion.text}" is on the page`;
          case 'text_absent':
            return `the text "${assertion.text}" is not on the page`;
          case 'element_present':
            return 'the element the flow read its result from is on the page';
          case 'url_matches':
            return `the page URL matches ${assertion.pattern}`;
        }
      })
      .join(', and ');

    return `  ${checkpoint.checkpointId} (runs after step ${checkpoint.afterStepId}): ${asserts}`;
  });

  return [
    `Goal: ${capability.goal}`,
    `Inputs: ${capability.inputs.map((input) => input.name).join(', ') || 'none'}`,
    `Outputs: ${capability.outputs.map((output) => output.name).join(', ') || 'none'}`,
    '',
    'Steps:',
    ...steps,
    '',
    'Checkpoints:',
    ...checkpoints,
  ].join('\n');
}

/**
 * Asks the model to name the business outcomes for a recorded capability.
 *
 * Returns rules that reference only real checkpoints — the artifact schema
 * rejects a rule pointing at a checkpoint that does not exist, so one invented
 * id would otherwise throw away the whole capability rather than one rule.
 */
export async function shapeBusinessOutcomes(
  capability: Capability,
  modelProvider: ModelProvider,
): Promise<BusinessOutcomeRule[]> {
  if (capability.checkpoints.length === 0) return [];

  const turn = await modelProvider.completeWithTools({
    system: systemPrompt,
    messages: [{ role: 'user', content: describeForShaping(capability) }],
    tools: [proposeOutcomesTool],
  });

  const call = turn.toolCalls.find((toolCall) => toolCall.toolName === proposeOutcomesTool.name);
  if (!call) return [];

  const proposed = call.input['outcomes'];
  if (!Array.isArray(proposed)) return [];

  const knownCheckpointIds = new Set(
    capability.checkpoints.map((checkpoint) => checkpoint.checkpointId),
  );
  const rules: BusinessOutcomeRule[] = [];
  const takenCodes = new Set<string>();

  for (const entry of proposed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { checkpointId, code, message } = entry as Record<string, unknown>;

    if (typeof checkpointId !== 'string' || !knownCheckpointIds.has(checkpointId)) continue;
    if (typeof code !== 'string' || takenCodes.has(code)) continue;

    const parsed = BusinessOutcomeRule.safeParse({
      code,
      message,
      condition: { when: 'checkpoint_failed', checkpointId },
    });
    if (!parsed.success) continue;

    takenCodes.add(code);
    rules.push(parsed.data);
  }

  return rules;
}
