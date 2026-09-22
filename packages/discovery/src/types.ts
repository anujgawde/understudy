import type { ModelProvider, ToolResult } from '@understudy/model-provider';
import type { Action, ActionClass, Policy, RunLog, RunLogEntry } from '@understudy/schemas';
import type { Surface } from '@understudy/surface';

export interface ConfirmActionRequest {
  action: Action;
  actionClass: ActionClass;
  reason: string;
}

export interface DiscoveryOptions {
  goal: string;
  startUrl: string;
  surface: Surface;
  modelProvider: ModelProvider;
  policy?: Policy;
  // Values the run was handed. The model is told the names and types
  // "{{name}}"; the value is substituted on its way to the page and never
  // enters the prompt, the conversation or the run log.
  inputs?: Record<string, string>;
  maxSteps?: number;
  onEntry?: (entry: RunLogEntry) => void;
  onConfirmAction?: (request: ConfirmActionRequest) => Promise<boolean>;
}

export interface DiscoveryResult {
  runLog: RunLog;
}

export interface FinishPayload {
  success: boolean;
  outputs?: Record<string, string>;
  businessOutcomeCode?: string;
  summary: string;
}

export interface ToolCallResult {
  toolResult: ToolResult;
  nextSequence: number;
  finishPayload: FinishPayload | null;
}
