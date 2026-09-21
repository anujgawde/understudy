import { describe, test, expect, afterEach, vi } from 'vitest';
import type { OllamaChatResponse, ToolDefinition } from '../src/types.js';
import { OllamaProvider } from '../src/ollama.js';

const tools: ToolDefinition[] = [
  { name: 'observe', description: 'Read the page', inputSchema: { type: 'object', properties: {} } },
  { name: 'act', description: 'Do something', inputSchema: { type: 'object', properties: {} } },
];

function respondWith(body: Partial<OllamaChatResponse>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => body } as Response),
  );
}

function complete() {
  return new OllamaProvider({ baseUrl: 'http://localhost:11434' }).completeWithTools({
    system: 'system',
    messages: [{ role: 'user', content: 'go' }],
    tools,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OllamaProvider tool call parsing', () => {
  test('prefers the structured tool_calls channel', async () => {
    respondWith({
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'observe', arguments: {} } }],
      },
    } as Partial<OllamaChatResponse>);

    const turn = await complete();

    expect(turn.stopReason).toBe('tool_use');
    expect(turn.toolCalls).toEqual([
      { toolCallId: 'ollama-0-observe', toolName: 'observe', input: {} },
    ]);
  });

  // llama3.1 announces the call in prose on every turn instead of filling
  // tool_calls, which left discovery burning its whole step budget on nudges.
  test('reads a tool call announced as prose in content', async () => {
    respondWith({
      message: {
        role: 'assistant',
        content:
          'To make progress I will first call the "observe" function.\n\n{"name": "observe", "parameters": {}}',
      },
    } as Partial<OllamaChatResponse>);

    const turn = await complete();

    expect(turn.stopReason).toBe('tool_use');
    expect(turn.toolCalls).toEqual([
      { toolCallId: 'ollama-content-0-observe', toolName: 'observe', input: {} },
    ]);
  });

  test('reads a fenced call and accepts arguments as an alias for parameters', async () => {
    respondWith({
      message: {
        role: 'assistant',
        content:
          'Here goes:\n```json\n{"name": "act", "arguments": {"actionType": "click", "elementRef": "e1"}}\n```',
      },
    } as Partial<OllamaChatResponse>);

    const turn = await complete();

    expect(turn.toolCalls).toEqual([
      {
        toolCallId: 'ollama-content-0-act',
        toolName: 'act',
        input: { actionType: 'click', elementRef: 'e1' },
      },
    ]);
  });

  test('ignores a name that was never offered as a tool', async () => {
    respondWith({
      message: {
        role: 'assistant',
        content: 'I could call {"name": "deleteEverything", "parameters": {}} but I will not.',
      },
    } as Partial<OllamaChatResponse>);

    const turn = await complete();

    expect(turn.toolCalls).toEqual([]);
    expect(turn.stopReason).toBe('end_turn');
  });

  test('ignores braces that are not JSON', async () => {
    respondWith({
      message: { role: 'assistant', content: 'The selector is div {color: red} and nothing more.' },
    } as Partial<OllamaChatResponse>);

    const turn = await complete();

    expect(turn.toolCalls).toEqual([]);
    expect(turn.stopReason).toBe('end_turn');
  });
});
