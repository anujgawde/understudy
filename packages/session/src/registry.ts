import type { Actor } from '@understudy/schemas';
import type { LedgerEntry, Session, SessionState } from './types.js';

const VALID_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  idle: ['running'],
  running: ['paused', 'idle'],
  paused: ['handed_off', 'running', 'idle'],
  handed_off: ['paused', 'idle'],
};

export class SessionRegistry {
  private sessions = new Map<string, Session>();

  create(sessionId: string): Session {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session "${sessionId}" already exists`);
    }

    const now = new Date().toISOString();
    const session: Session = {
      sessionId,
      state: 'idle',
      controlToken: { heldBy: 'system', acquiredAt: now },
      runId: undefined,
      capabilityId: undefined,
      ledger: [],
      interventions: [],
    };

    this.appendLedger(session, 'system', 'session_created');
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found`);
    }
    return session;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  transition(sessionId: string, to: SessionState, actor: Actor): Session {
    const session = this.get(sessionId);
    const allowed = VALID_TRANSITIONS[session.state];

    if (!allowed.includes(to)) {
      throw new Error(
        `Invalid transition: "${session.state}" → "${to}" (allowed: ${allowed.join(', ')})`,
      );
    }

    session.state = to;
    session.controlToken = { heldBy: actor, acquiredAt: new Date().toISOString() };
    return session;
  }

  startRun(sessionId: string, runId: string, capabilityId?: string): Session {
    const session = this.transition(sessionId, 'running', 'system');
    session.runId = runId;
    session.capabilityId = capabilityId;
    this.appendLedger(session, 'system', 'run_started', { runId, capabilityId });
    return session;
  }

  completeRun(sessionId: string): Session {
    const session = this.transition(sessionId, 'idle', 'system');
    this.appendLedger(session, 'system', 'run_completed', { runId: session.runId });
    session.runId = undefined;
    session.capabilityId = undefined;
    return session;
  }

  appendLedger(
    session: Session,
    actor: Actor,
    action: LedgerEntry['action'],
    detail?: Record<string, unknown>,
  ): LedgerEntry {
    const entry: LedgerEntry = {
      entryId: crypto.randomUUID(),
      sessionId: session.sessionId,
      occurredAt: new Date().toISOString(),
      actor,
      action,
      detail,
    };
    session.ledger.push(entry);
    return entry;
  }

  listSessions(): readonly Session[] {
    return [...this.sessions.values()];
  }
}
