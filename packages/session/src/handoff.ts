import type { OperatorInput } from '@understudy/schemas';
import type { SessionRegistry } from './registry.js';
import type { Intervention, Session } from './types.js';

/**
 * Whether the operator may drive the page right now. Handed to the takeover as
 * a function so it reads this on every input rather than caching an answer that
 * stops being true the moment control goes back.
 */
export function operatorHoldsControl(registry: SessionRegistry, sessionId: string): boolean {
  if (!registry.has(sessionId)) return false;
  const session = registry.get(sessionId);
  return session.state === 'handed_off' && session.controlToken.heldBy === 'operator';
}

/**
 * Records one thing the operator did, as evidence rather than as instruction —
 * the brief asks for the human's actions to be captured, and the design bars
 * them from being folded back into an artifact. Values typed by the operator
 * are deliberately not stored: they are as likely to be a credential as
 * anything else, and the fact that typing happened is the auditable part.
 */
export function recordOperatorInput(
  registry: SessionRegistry,
  sessionId: string,
  input: OperatorInput,
): void {
  const session = registry.get(sessionId);
  const detail: Record<string, unknown> = { inputType: input.inputType };

  if ('x' in input) detail['x'] = input.x;
  if ('y' in input) detail['y'] = input.y;
  if (input.inputType === 'key_press') detail['key'] = input.key;
  if (input.inputType === 'type_text') detail['characters'] = input.text.length;

  registry.appendLedger(session, 'operator', 'operator_input', detail);
}

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
