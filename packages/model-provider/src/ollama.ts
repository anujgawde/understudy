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

    const toolCalls: ToolCall[] = (body.message?.tool_calls ?? []).map((call, index) => ({
      toolCallId: `ollama-${index}-${call.function.name}`,
      toolName: call.function.name,
      input: call.function.arguments ?? {},
    }));

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
