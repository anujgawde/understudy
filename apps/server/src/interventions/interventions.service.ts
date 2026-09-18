import { Injectable, NotFoundException } from '@nestjs/common';
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

  raise(options: RaiseOptions): Intervention {
    return raiseIntervention({ registry: this.registry, ...options });
  }

  shouldEscalate(failureCode: FailureCode): boolean {
    return shouldEscalate(failureCode);
  }

  findBySession(sessionId: string): Intervention[] {
    const session = this.registry.get(sessionId);
    return session.interventions;
  }

  findOpen(sessionId?: string): Intervention[] {
    const sessions = sessionId
      ? [this.registry.get(sessionId)]
      : this.registry.listSessions();

    return sessions.flatMap((session) =>
      session.interventions.filter(
        (intervention) => intervention.state !== 'resolved',
      ),
    );
  }

  findOne(sessionId: string, interventionId: string): Intervention {
    const session = this.registry.get(sessionId);
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
    return handOff(this.registry, sessionId, operatorId);
  }

  handBack(sessionId: string, operatorId: string): Session {
    return handBack(this.registry, sessionId, operatorId);
  }

  resolve(sessionId: string): Session {
    return resolveIntervention(this.registry, sessionId);
  }
}
