import type { SessionRegistry } from './registry.js';
import type { Intervention, Session } from './types.js';

function openIntervention(session: Session): Intervention {
  const intervention = session.interventions.findLast((candidate) => candidate.state !== 'resolved');
  if (!intervention) {
    throw new Error(`Session "${session.sessionId}" has no open intervention`);
  }
  return intervention;
}

export function handOff(registry: SessionRegistry, sessionId: string, operatorId: string): Session {
  const session = registry.get(sessionId);

  if (session.state !== 'paused') {
    throw new Error(
      `Cannot hand off session "${sessionId}" in state "${session.state}" (must be "paused")`,
    );
  }

  openIntervention(session).state = 'acknowledged';

  registry.transition(sessionId, 'handed_off', 'operator');
  registry.appendLedger(session, 'operator', 'handed_off', { operatorId });

  return session;
}

export function handBack(registry: SessionRegistry, sessionId: string, operatorId: string): Session {
  const session = registry.get(sessionId);

  if (session.state !== 'handed_off') {
    throw new Error(
      `Cannot hand back session "${sessionId}" in state "${session.state}" (must be "handed_off")`,
    );
  }

  // Control returns to the system, but the run is not resumed here — the
  // re-assertion gate decides whether the page the operator left behind is
  // actually safe to replay into.
  registry.transition(sessionId, 'paused', 'system');
  registry.appendLedger(session, 'operator', 'handed_back', { operatorId });

  return session;
}

export function resolveIntervention(registry: SessionRegistry, sessionId: string): Session {
  const session = registry.get(sessionId);

  if (session.state !== 'paused') {
    throw new Error(
      `Cannot resume session "${sessionId}" in state "${session.state}" (must be "paused")`,
    );
  }

  openIntervention(session).state = 'resolved';

  registry.transition(sessionId, 'running', 'system');
  registry.appendLedger(session, 'system', 'run_resumed', { runId: session.runId });

  return session;
}
