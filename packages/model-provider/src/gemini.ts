import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from '@google/genai';
import type {
  ConversationMessage,
  GeminiProviderOptions,
  ModelProvider,
  ModelTurn,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from './types.js';

export class GeminiProvider implements ModelProvider {
  readonly modelId: string;
  private readonly client: GoogleGenAI;

  constructor(options?: GeminiProviderOptions) {
    this.modelId = options?.modelId ?? 'gemini-2.5-flash';
    this.client = new GoogleGenAI({ apiKey: options?.apiKey ?? process.env['GEMINI_API_KEY'] });
  }

  async completeWithTools(options: {
    system: string;
    messages: ConversationMessage[];
    tools: ToolDefinition[];
  }): Promise<ModelTurn> {
    const contents = toGeminiContents(options.messages);
    const functionDeclarations = options.tools.map(toGeminiFunctionDeclaration);

    const response = await this.client.models.generateContent({
      model: this.modelId,
      contents,
      config: {
        systemInstruction: options.system,
        tools: [{ functionDeclarations }],
      },
    });

    let rationale: string | null = null;
    const toolCalls: ToolCall[] = [];

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) {
        rationale = part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          toolCallId: `gemini-${crypto.randomUUID()}`,
          toolName: part.functionCall.name ?? '',
          input: (part.functionCall.args as Record<string, unknown>) ?? {},
        });
      }
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    let stopReason: ModelTurn['stopReason'];
    if (toolCalls.length > 0) {
      stopReason = 'tool_use';
    } else if (finishReason === 'MAX_TOKENS') {
      stopReason = 'max_tokens';
    } else {
      stopReason = 'end_turn';
    }

    return {
      rationale,
      toolCalls,
      stopReason,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}

function toGeminiFunctionDeclaration(tool: ToolDefinition): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.inputSchema,
  };
}

function toGeminiContents(messages: ConversationMessage[]): Content[] {
  const contents: Content[] = [];

  for (const message of messages) {
    if (message.role === 'user' && typeof message.content === 'string') {
      contents.push({
        role: 'user',
        parts: [{ text: message.content }],
      });
    } else if (message.role === 'user' && Array.isArray(message.content)) {
      const parts: Part[] = (message.content as ToolResult[]).map((result) => ({
        functionResponse: {
          name: findToolNameForResult(result, messages),
          response: {
            content: result.content,
            isError: result.isError ?? false,
          },
        },
      }));
      contents.push({ role: 'user', parts });
    } else if (message.role === 'assistant') {
      const parts: Part[] = [];
      if (message.rationale) {
        parts.push({ text: message.rationale });
      }
      for (const call of message.toolCalls) {
        parts.push({
          functionCall: {
            name: call.toolName,
            args: call.input,
          },
        });
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts });
      }
    }
  }

  return contents;
}

function findToolNameForResult(
  result: ToolResult,
  messages: ConversationMessage[],
): string {
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
