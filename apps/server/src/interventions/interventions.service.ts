import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { FailureCode } from '@understudy/schemas';
import {
  SessionRegistry,
  raiseIntervention,
  shouldEscalate,
  handOff,
  handBack,
  resolveIntervention,
  type Intervention,
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
  constructor(private readonly registry: SessionRegistry) {}

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
