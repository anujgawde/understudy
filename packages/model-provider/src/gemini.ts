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
  // Gemini 3 rejects a replayed function call whose thought signature is missing, and the
  // signature belongs to the model rather than to the call, so it cannot be rebuilt from
  // the conversation. Held here by tool call id rather than on the shared ToolCall type,
  // which the Anthropic and Ollama adapters also use.
  private readonly thoughtSignatures = new Map<string, string>();

  constructor(options?: GeminiProviderOptions) {
    this.modelId = options?.modelId ?? 'gemini-3.6-flash';
    this.client = new GoogleGenAI({ apiKey: options?.apiKey ?? process.env['GEMINI_API_KEY'] });
  }

  async completeWithTools(options: {
    system: string;
    messages: ConversationMessage[];
    tools: ToolDefinition[];
  }): Promise<ModelTurn> {
    const contents = toGeminiContents(options.messages, this.thoughtSignatures);
    const functionDeclarations = options.tools.map(toGeminiFunctionDeclaration);

    // The free tier allows 5 requests per minute and a discovery run needs far more than
    // that, so rate limiting is the normal case rather than an edge case. Transient 503s
    // are retried on the same path: losing a whole run to one is worse than waiting.
    let response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await this.client.models.generateContent({
          model: this.modelId,
          contents,
          config: {
            systemInstruction: options.system,
            tools: [{ functionDeclarations }],
          },
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable = /\b(429|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE/.test(message);
        if (!retryable || attempt >= 6) throw error;

        // Gemini reports how long to wait; fall back to backing off when it does not.
        const suggestedSeconds = message.match(/"retryDelay"\s*:\s*"(\d+)s"/)?.[1];
        const waitMilliseconds = suggestedSeconds
          ? Number(suggestedSeconds) * 1000 + 1000
          : Math.min(2000 * 2 ** attempt, 60000);
        await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
      }
    }

    let rationale: string | null = null;
    const toolCalls: ToolCall[] = [];

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) {
        rationale = part.text;
      }
      if (part.functionCall) {
        const toolCallId = `gemini-${crypto.randomUUID()}`;
        if (part.thoughtSignature) {
          this.thoughtSignatures.set(toolCallId, part.thoughtSignature);
        }
        toolCalls.push({
          toolCallId,
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

function toGeminiContents(
  messages: ConversationMessage[],
  thoughtSignatures: Map<string, string>,
): Content[] {
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
        const thoughtSignature = thoughtSignatures.get(call.toolCallId);
        parts.push({
          functionCall: {
            name: call.toolName,
            args: call.input,
          },
          // Sits on the part beside functionCall, not inside it.
          ...(thoughtSignature ? { thoughtSignature } : {}),
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
