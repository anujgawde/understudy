import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { FailureCode } from '@understudy/schemas';
import { JsonStore } from '../json-store.js';
import {
  SessionRegistry,
  raiseIntervention,
  shouldEscalate,
  handOff,
  handBack,
  resolveIntervention,
  type Intervention,
  type LedgerEntry,
  type Session,
} from '@understudy/session';

export interface RaiseOptions {
  sessionId: string;
  runId: string;
  capabilityId?: string;
  failureCode: FailureCode;
  failedAtStepId?: string;
  lastSuccessfulStepId?: string;
  message: string;
  pageUrl?: string;
}

@Injectable()
export class InterventionsService {
  // The registry holds sessions this process is driving. Interventions raised
  // by a CLI run happened in a different process entirely, and an inbox that
  // empties when the server restarts is not an inbox — so what is reported is
  // written down rather than remembered.
  private readonly store = new JsonStore<Intervention>('interventions');
  private readonly ledgers = new JsonStore<LedgerEntry[]>('ledgers');

  constructor(private readonly registry: SessionRegistry) {}

  /** Records an intervention raised elsewhere, so it outlives the run and the process. */
  record(intervention: Intervention, ledger?: LedgerEntry[]): Intervention {
    this.store.set(intervention.interventionId, intervention);
    if (ledger && ledger.length > 0) this.ledgers.set(intervention.interventionId, ledger);
    return intervention;
  }

  /** Everything recorded, newest first, whichever process raised it. */
  findAll(): Intervention[] {
    const live = this.registry.listSessions().flatMap((session) => session.interventions);
    const stored = this.store.all();

    const byId = new Map<string, Intervention>();
    for (const intervention of [...stored, ...live]) {
      byId.set(intervention.interventionId, intervention);
    }

    return [...byId.values()].sort((left, right) => right.raisedAt.localeCompare(left.raisedAt));
  }

  /** The most recently recorded ledger, which is what the takeover screen reads. */
  findLedger(): LedgerEntry[] {
    for (const intervention of this.findAll()) {
      const ledger = this.ledgers.get(intervention.interventionId);
      if (ledger) return ledger;
    }
    return [];
  }

  // The session package signals both a missing session and a refused state
  // transition as a plain Error. Left alone every one of those becomes a 500,
  // so they are separated here into the statuses a client can act on.
  private translateErrors<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw message.includes('not found')
        ? new NotFoundException(message)
        : new ConflictException(message);
    }
  }

  raise(options: RaiseOptions): Intervention {
    return this.translateErrors(() => raiseIntervention({ registry: this.registry, ...options }));
  }

  shouldEscalate(failureCode: FailureCode): boolean {
    return shouldEscalate(failureCode);
  }

  findBySession(sessionId: string): Intervention[] {
    return this.translateErrors(() => this.registry.get(sessionId).interventions);
  }

  findOpen(sessionId?: string): Intervention[] {
    const sessions = sessionId
      ? [this.translateErrors(() => this.registry.get(sessionId))]
      : this.registry.listSessions();

    return sessions.flatMap((session) =>
      session.interventions.filter((intervention) => intervention.state !== 'resolved'),
    );
  }

  findOne(sessionId: string, interventionId: string): Intervention {
    const session = this.translateErrors(() => this.registry.get(sessionId));
    const intervention = session.interventions.find(
      (candidate) => candidate.interventionId === interventionId,
    );
    if (!intervention) {
      throw new NotFoundException(
        `Intervention "${interventionId}" not found in session "${sessionId}"`,
      );
    }
    return intervention;
  }

  handOff(sessionId: string, operatorId: string): Session {
    return this.translateErrors(() => handOff(this.registry, sessionId, operatorId));
  }

  handBack(sessionId: string, operatorId: string): Session {
    return this.translateErrors(() => handBack(this.registry, sessionId, operatorId));
  }

  resolve(sessionId: string): Session {
    return this.translateErrors(() => resolveIntervention(this.registry, sessionId));
  }
}
