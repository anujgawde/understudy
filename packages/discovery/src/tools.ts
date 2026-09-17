import type { ToolDefinition } from '@understudy/model-provider';

export const discoveryTools: ToolDefinition[] = [
  {
    name: 'observe',
    description:
      'Observe the current page. Returns the URL, page title, and every interactive element ' +
      'with its role, accessible name, current value, and elementRef handle. Call this to ' +
      'understand what is on screen before acting.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'act',
    description:
      'Perform a single action on the page. Use "navigate" to go to a URL, "click" to click ' +
      'an element by its elementRef, or "fill" to type into a field by its elementRef. After ' +
      'each action the system automatically re-observes the page and returns the new state.',
    inputSchema: {
      type: 'object',
      properties: {
        actionType: {
          type: 'string',
          enum: ['navigate', 'click', 'fill'],
          description: 'The kind of action to perform.',
        },
        url: {
          type: 'string',
          description: 'For navigate: the URL to go to.',
        },
        elementRef: {
          type: 'string',
          description:
            'For click and fill: the elementRef from a previous observation.',
        },
        value: {
          type: 'string',
          description: 'For fill: the text value to enter into the field.',
        },
      },
      required: ['actionType'],
    },
  },
  {
    name: 'extract',
    description:
      'Extract the text content of a single element identified by its elementRef. Use this ' +
      'to read a specific value from the page (e.g. an account balance, a status label) ' +
      'that you intend to return as an output.',
    inputSchema: {
      type: 'object',
      properties: {
        elementRef: {
          type: 'string',
          description: 'The elementRef from a previous observation.',
        },
      },
      required: ['elementRef'],
    },
  },
  {
    name: 'finish',
    description:
      'Signal that the goal has been reached (or that a business outcome was encountered). ' +
      'Call this exactly once when you are done. If success is true, provide any outputs ' +
      'that the goal asked for. If success is false, explain what business outcome you ' +
      'encountered (e.g. "member not found").',
    inputSchema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the goal was achieved.',
        },
        outputs: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description:
            'Key-value pairs of extracted data when success is true. ' +
            'Keys should be descriptive camelCase names.',
        },
        businessOutcomeCode: {
          type: 'string',
          description:
            'When success is false: a short snake_case code for the outcome (e.g. "member_not_found").',
        },
        summary: {
          type: 'string',
          description: 'A one-sentence summary of what happened.',
        },
      },
      required: ['success', 'summary'],
    },
  },
];
