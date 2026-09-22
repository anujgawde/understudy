import { z } from 'zod';
import { Actor, type FailureCode } from '@understudy/schemas';
import type { SessionRegistry } from './registry.js';

export const SessionState = z.enum(['idle', 'running', 'paused', 'handed_off']);
export type SessionState = z.infer<typeof SessionState>;

export const ControlToken = z.object({
  heldBy: Actor,
  acquiredAt: z.iso.datetime(),
});
export type ControlToken = z.infer<typeof ControlToken>;

export const LedgerEntry = z.object({
  entryId: z.string().min(1),
  sessionId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  actor: Actor,
  action: z.enum([
    'session_created',
    'run_started',
    'intervention_raised',
    'handed_off',
    'handed_back',
    'operator_input',
    'run_resumed',
    'run_completed',
  ]),
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

export const InterventionSeverity = z.enum(['warning', 'critical']);
export type InterventionSeverity = z.infer<typeof InterventionSeverity>;

export const InterventionState = z.enum(['raised', 'acknowledged', 'resolved']);
export type InterventionState = z.infer<typeof InterventionState>;

export const Intervention = z.object({
  interventionId: z.string().min(1),
  sessionId: z.string().min(1),
  raisedAt: z.iso.datetime(),
  severity: InterventionSeverity,
  state: InterventionState,
  failureCode: z.string().min(1),
  failedAtStepId: z.string().min(1).optional(),
  message: z.string().min(1),
  context: z.object({
    runId: z.string().min(1),
    capabilityId: z.string().min(1).optional(),
    pageUrl: z.string().optional(),
    // The brief asks an intervention to carry the current state or a
    // screenshot. A URL says where the run stopped; the frame says what the
    // operator is about to be handed, which is what makes the inbox usable
    // without opening the session first.
    screenshotPath: z.string().min(1).optional(),
    lastSuccessfulStepId: z.string().min(1).optional(),
  }),
});
export type Intervention = z.infer<typeof Intervention>;

export interface Session {
  sessionId: string;
  state: SessionState;
  controlToken: ControlToken;
  runId: string | undefined;
  capabilityId: string | undefined;
  ledger: LedgerEntry[];
  interventions: Intervention[];
}

export interface RaiseInterventionOptions {
  registry: SessionRegistry;
  sessionId: string;
  runId: string;
  capabilityId?: string;
  failureCode: FailureCode;
  failedAtStepId?: string;
  lastSuccessfulStepId?: string;
  message: string;
  pageUrl?: string;
  screenshotPath?: string;
}

/**
 * The line is whether a human at the keyboard could actually do something about
 * it. An expired session, a checkpoint that stopped holding, a step waiting on
 * approval and a dialog nobody declared are all states an operator can resolve
 * on the live page and hand back from.
 *
 * `locator_not_found` is deliberately absent: a ladder that matches nothing is
 * an artifact that needs re-recording, and parking an operator in front of it
 * asks them to fix a bug by hand, once, invisibly. `app_error` is absent for the
 * opposite reason — nobody can repair a 500 from inside the session; that run
 * needs retrying later, not taking over.
 */
export const ESCALATION_WORTHY_FAILURES: ReadonlySet<FailureCode> = new Set([
  'timeout',
  'session_expired',
  'assertion_failed',
  'navigation_failed',
  'approval_required',
  'unexpected_dialog',
]);
