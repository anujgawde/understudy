import type { ModelProvider } from '@understudy/model-provider';
import type { Capability } from '@understudy/schemas';
import type { CapabilityMatch } from './types.js';

/**
 * Matching is on the shape of the task, never on the values in it. A capability
 * discovered against member 12345 is the same capability for member 67890 — its
 * steps already hold {{memberNumber}} rather than a number — so a matcher that
 * compared the sentences would record one artifact per member and replay none
 * of them. The model's job is to see past the values to the task, and to say
 * which of this capability's declared inputs each value in the request fills.
 */
const selectTool = {
  name: 'selectCapability',
  description:
    'Report which recorded capability performs the requested task, and what its inputs should ' +
    'be set to. Report no match if none of them performs this task.',
  inputSchema: {
    type: 'object',
    properties: {
      capabilityId: {
        type: 'string',
        description:
          'The capabilityId that performs this task, exactly as listed. Empty string if none does.',
      },
      inputs: {
        type: 'array',
        description:
          'A value for each input the chosen capability declares, read out of the request. ' +
          'Omit an input the request does not mention — a credential, for example, is supplied ' +
          'separately and never appears in the request text.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'An input name the capability declares.' },
            value: { type: 'string', description: 'The value from the request.' },
          },
          required: ['name', 'value'],
        },
      },
    },
    required: ['capabilityId'],
  },
};

const systemPrompt = `You route a request to a recorded browser automation, or say that none fits.

Each capability below was discovered once by working through a real task, and its steps are
parameterised: the specific values from that original task were replaced by named inputs. So a
capability recorded while looking up member 12345 is the capability for looking up ANY member.
Its goal text still names 12345 because that is what was asked that day — treat it as an
example of the shape, not as a restriction.

Match on what the task DOES, not on the words it uses. "Look up member 67890 and read the
savings balance", "what is member 41's current savings?" and "check the savings balance for
account 555-2" are all the same task as the example above, and all match that capability.

Then read the request for values that fill the capability's declared inputs. If the request
names member 67890 and the capability declares an input called memberNumber, that input is
"67890". Leave out inputs the request says nothing about.

Report no match — an empty capabilityId — when no listed capability performs this task. That is
a normal answer, not a failure: the task will then be worked out from scratch. Never stretch a
capability to cover a task it does not do. Reading a balance is not the same task as
transferring one, and a wrong match runs the wrong steps against a real system.`;

function describeForMatching(capabilities: Capability[]): string {
  return capabilities
    .map((capability) => {
      const inputs = capability.inputs
        .map(
          (input) =>
            `${input.name}${input.secret ? ' (supplied separately, never in the request)' : ''}` +
            `${input.description ? ` — ${input.description}` : ''}`,
        )
        .join('; ');

      return [
        `capabilityId: ${capability.capabilityId}`,
        `  discovered from: ${capability.goal}`,
        `  inputs: ${inputs || 'none'}`,
        `  returns: ${capability.outputs.map((output) => output.name).join(', ') || 'nothing'}`,
      ].join('\n');
    })
    .join('\n\n');
}

export async function matchCapability(
  goal: string,
  capabilities: Capability[],
  modelProvider: ModelProvider,
): Promise<CapabilityMatch | null> {
  if (capabilities.length === 0) return null;

  const turn = await modelProvider.completeWithTools({
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Request: ${goal}\n\nRecorded capabilities:\n\n${describeForMatching(capabilities)}`,
      },
    ],
    tools: [selectTool],
  });

  const call = turn.toolCalls.find((toolCall) => toolCall.toolName === selectTool.name);
  if (!call) return null;

  const capabilityId = call.input['capabilityId'];
  if (typeof capabilityId !== 'string' || capabilityId === '') return null;

  const chosen = capabilities.find(
    (capability) => capability.capabilityId === capabilityId,
  );
  if (!chosen) return null;

  // Only inputs the capability actually declares. A value bound to a name it
  // does not know would be passed to replay and rejected there, which reads as
  // a broken artifact rather than as a bad match.
  const declared = new Set(chosen.inputs.map((input) => input.name));
  const inputs: Record<string, string> = {};

  const proposed = call.input['inputs'];
  if (Array.isArray(proposed)) {
    for (const entry of proposed) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { name, value } = entry as Record<string, unknown>;
      if (typeof name === 'string' && typeof value === 'string' && declared.has(name)) {
        inputs[name] = value;
      }
    }
  }

  return { capabilityId, inputs };
}
