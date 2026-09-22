import type { Capability, FailureCode, Recovery, RunLog, RunLogEntry } from '@understudy/schemas';
import type { Surface } from '@understudy/surface';
import type { Intervention, SessionRegistry } from '@understudy/session';

export interface TerminalState {
  completedAllSteps: boolean;
  failedAtStepId?: string;
  failureCode?: FailureCode;
  failureMessage?: string;
  failedCheckpointId?: string;
  // Set when a read-only check failed once and passed on a second look. The run
  // still reaches its outputs, but it did not get there first time and the
  // outcome says so rather than presenting itself as a clean success.
  recoveredFrom?: FailureCode;
  attempts?: number;
  // What was actually cleared, in the order it happened. `recoveredFrom` says a
  // recovery took place; this says which, so "waited and read again" and
  // "dismissed a maintenance notice" do not arrive as the same event.
  recoveries?: Recovery[];
  outputs: Record<string, unknown>;
}

export interface SessionContext {
  registry: SessionRegistry;
  sessionId: string;
}

export interface ExecutorOptions {
  capability: Capability;
  surface: Surface;
  inputs: Record<string, string>;
  runId?: string;
  session?: SessionContext;
  // Set when an operator has handed the session back. The step named here is
  // re-entered, but only once the gate below confirms the page still satisfies
  // what the previous step established.
  resumeAtStepId?: string;
  // Irreversible steps pause for a human by default. Set when the caller has
  // already accepted that this run may commit something — an unattended
  // schedule, or an operator who approved the whole run up front.
  approveIrreversible?: boolean;
  // Called as each entry is recorded, while the page is still in the state that
  // produced it — which is the only moment a caller can photograph it. Awaited,
  // so a slow observer holds the run rather than racing the next step.
  onEntry?: (entry: RunLogEntry) => void | Promise<void>;
}

export interface ExecutorResult {
  runLog: RunLog;
  intervention?: Intervention;
}

export type ReassertResult =
  | { held: true }
  | { held: false; reason: string; checkpointId?: string };
