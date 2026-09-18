import { z } from 'zod';
import { Actor, type FailureCode } from '@understudy/schemas';

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

export const ESCALATION_WORTHY_FAILURES: ReadonlySet<FailureCode> = new Set([
  'timeout',
  'session_expired',
  'assertion_failed',
  'navigation_failed',
]);
