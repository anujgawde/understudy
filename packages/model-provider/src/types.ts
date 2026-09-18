export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface ModelTurn {
  rationale: string | null;
  toolCalls: ToolCall[];
  stopReason: 'tool_use' | 'end_turn' | 'max_tokens';
  inputTokens: number;
  outputTokens: number;
}

export type ConversationMessage =
  | { role: 'user'; content: string }
  | { role: 'user'; content: ToolResult[] }
  | { role: 'assistant'; rationale: string | null; toolCalls: ToolCall[] };

export interface ModelProvider {
  readonly modelId: string;

  completeWithTools(options: {
    system: string;
    messages: ConversationMessage[];
    tools: ToolDefinition[];
  }): Promise<ModelTurn>;
}

export interface AnthropicProviderOptions {
  modelId?: string;
  maxTokens?: number;
}

export interface GeminiProviderOptions {
  modelId?: string;
  apiKey?: string;
}
