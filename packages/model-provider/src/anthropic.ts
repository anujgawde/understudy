import Anthropic from '@anthropic-ai/sdk';
import type {
  AnthropicProviderOptions,
  ConversationMessage,
  ModelProvider,
  ModelTurn,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from './types.js';

export class AnthropicProvider implements ModelProvider {
  readonly modelId: string;
  private readonly client: Anthropic;
  private readonly maxTokens: number;

  constructor(options?: AnthropicProviderOptions) {
    this.modelId = options?.modelId ?? 'claude-sonnet-4-20250514';
    this.maxTokens = options?.maxTokens ?? 4096;
    this.client = new Anthropic();
  }

  async completeWithTools(options: {
    system: string;
    messages: ConversationMessage[];
    tools: ToolDefinition[];
  }): Promise<ModelTurn> {
    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: this.maxTokens,
      system: options.system,
      messages: options.messages.map(toAnthropicMessage),
      tools: options.tools.map(toAnthropicTool),
    });

    let rationale: string | null = null;
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        rationale = block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          toolCallId: block.id,
          toolName: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      rationale,
      toolCalls,
      stopReason: response.stop_reason as ModelTurn['stopReason'],
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

function toAnthropicMessage(message: ConversationMessage): Anthropic.MessageParam {
  if (message.role === 'user' && typeof message.content === 'string') {
    return { role: 'user', content: message.content };
  }

  if (message.role === 'user' && Array.isArray(message.content)) {
    return {
      role: 'user',
      content: (message.content as ToolResult[]).map((result) => ({
        type: 'tool_result' as const,
        tool_use_id: result.toolCallId,
        content: result.content,
        is_error: result.isError ?? false,
      })),
    };
  }

  const assistantMessage = message as Extract<ConversationMessage, { role: 'assistant' }>;
  const content: Anthropic.ContentBlockParam[] = [];
  if (assistantMessage.rationale) {
    content.push({ type: 'text', text: assistantMessage.rationale });
  }
  for (const call of assistantMessage.toolCalls) {
    content.push({
      type: 'tool_use',
      id: call.toolCallId,
      name: call.toolName,
      input: call.input,
    });
  }
  return { role: 'assistant', content };
}

function toAnthropicTool(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  };
}
