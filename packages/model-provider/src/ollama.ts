import type {
  ConversationMessage,
  ModelProvider,
  ModelTurn,
  OllamaChatResponse,
  OllamaMessage,
  OllamaProviderOptions,
  OllamaToolCall,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from './types.js';

export class OllamaProvider implements ModelProvider {
  readonly modelId: string;
  private readonly baseUrl: string;
  private readonly contextWindow: number;

  constructor(options?: OllamaProviderOptions) {
    this.modelId = options?.modelId ?? 'llama3.1';
    this.baseUrl = options?.baseUrl ?? process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
    // Ollama's own default is small enough to silently truncate the accumulated
    // observations, which loses the elementRef handles the model needs to act.
    this.contextWindow = options?.contextWindow ?? 16384;
  }

  async completeWithTools(options: {
    system: string;
    messages: ConversationMessage[];
    tools: ToolDefinition[];
  }): Promise<ModelTurn> {
    const messages: OllamaMessage[] = [
      { role: 'system', content: options.system },
      ...toOllamaMessages(options.messages),
    ];

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelId,
          stream: false,
          options: { temperature: 0, num_ctx: this.contextWindow },
          messages,
          tools: options.tools.map(toOllamaTool),
        }),
      });
    } catch (cause) {
      throw new Error(
        `Could not reach Ollama at ${this.baseUrl}. Is it running? Start it with "ollama serve".`,
        { cause },
      );
    }

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as OllamaChatResponse;

    let toolCalls: ToolCall[] = (body.message?.tool_calls ?? []).map((call, index) => ({
      toolCallId: `ollama-${index}-${call.function.name}`,
      toolName: call.function.name,
      input: call.function.arguments ?? {},
    }));

    if (toolCalls.length === 0 && body.message?.content) {
      toolCalls = parseToolCallsFromContent(body.message.content, options.tools);
    }

    let stopReason: ModelTurn['stopReason'];
    if (toolCalls.length > 0) {
      stopReason = 'tool_use';
    } else if (body.done_reason === 'length') {
      stopReason = 'max_tokens';
    } else {
      stopReason = 'end_turn';
    }

    return {
      rationale: body.message?.content || null,
      toolCalls,
      stopReason,
      inputTokens: body.prompt_eval_count ?? 0,
      outputTokens: body.eval_count ?? 0,
    };
  }
}


// Small models routinely announce a tool call as prose in `content` rather than
// filling Ollama's structured tool_calls channel. llama3.1 does this on every
// turn: the decision is right and the JSON is well formed, and without reading
// it here the run spends its whole step budget being told it called nothing.
function parseToolCallsFromContent(content: string, tools: ToolDefinition[]): ToolCall[] {
  const offered = new Set(tools.map((tool) => tool.name));
  const calls: ToolCall[] = [];

  for (const candidate of jsonObjectsIn(content)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }

    if (typeof parsed !== 'object' || parsed === null) continue;
    const record = parsed as { name?: unknown; parameters?: unknown; arguments?: unknown };
    // Only a name the model was actually offered counts. Without this, a model
    // quoting a JSON example in its reasoning would be executed.
    if (typeof record.name !== 'string' || !offered.has(record.name)) continue;

    const input = record.parameters ?? record.arguments ?? {};
    calls.push({
      toolCallId: `ollama-content-${calls.length}-${record.name}`,
      toolName: record.name,
      input: typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {},
    });
  }

  return calls;
}

// Yields every brace-balanced span, so a call embedded in a sentence or fenced
// in a code block is found without having to parse either.
function* jsonObjectsIn(text: string): Generator<string> {
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let end = start; end < text.length; end++) {
      const character = text[end]!;

      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = !inString;
      } else if (!inString && character === '{') {
        depth++;
      } else if (!inString && character === '}') {
        depth--;
        if (depth === 0) {
          yield text.slice(start, end + 1);
          start = end;
          break;
        }
      }
    }
  }
}

function toOllamaTool(tool: ToolDefinition) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

function toOllamaMessages(messages: ConversationMessage[]): OllamaMessage[] {
  const mapped: OllamaMessage[] = [];

  for (const message of messages) {
    if (message.role === 'user' && typeof message.content === 'string') {
      mapped.push({ role: 'user', content: message.content });
    } else if (message.role === 'user' && Array.isArray(message.content)) {
      // Ollama takes one message per tool result, so a turn's results fan out.
      for (const result of message.content as ToolResult[]) {
        mapped.push({
          role: 'tool',
          // A tool message carries no error flag, so a failure has to read as one.
          content: result.isError ? `Error: ${result.content}` : result.content,
          tool_name: findToolNameForResult(result, messages),
        });
      }
    } else if (message.role === 'assistant') {
      const toolCalls: OllamaToolCall[] = message.toolCalls.map((call) => ({
        function: { name: call.toolName, arguments: call.input },
      }));
      mapped.push({
        role: 'assistant',
        content: message.rationale ?? '',
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    }
  }

  return mapped;
}

function findToolNameForResult(result: ToolResult, messages: ConversationMessage[]): string {
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const call of message.toolCalls) {
        if (call.toolCallId === result.toolCallId) {
          return call.toolName;
        }
      }
    }
  }
  return 'unknown';
}
