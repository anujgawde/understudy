import { describe, test, expect } from 'vitest';
import { SessionRegistry } from '../src/registry.js';
import { raiseIntervention } from '../src/intervention.js';
import { handOff, handBack, resolveIntervention } from '../src/handoff.js';

function pausedSession(sessionId = 's1') {
  const registry = new SessionRegistry();
  registry.create(sessionId);
  registry.startRun(sessionId, 'run-1', 'cap-1');
  const intervention = raiseIntervention({
    registry,
    sessionId,
    runId: 'run-1',
    failureCode: 'timeout',
    message: 'Timed out',
  });
  return { registry, intervention };
}

describe('handOff', () => {
  test('moves a paused session to handed_off under the operator', () => {
    const { registry } = pausedSession();
    const session = handOff(registry, 's1', 'op-jane');

    expect(session.state).toBe('handed_off');
    expect(session.controlToken.heldBy).toBe('operator');
  });

  test('acknowledges the open intervention', () => {
    const { registry, intervention } = pausedSession();
    handOff(registry, 's1', 'op-jane');

    const session = registry.get('s1');
    expect(session.interventions[0]!.interventionId).toBe(intervention.interventionId);
    expect(session.interventions[0]!.state).toBe('acknowledged');
  });

  test('records the operator in the ledger', () => {
    const { registry } = pausedSession();
    handOff(registry, 's1', 'op-jane');

    const entry = registry.get('s1').ledger.find((e) => e.action === 'handed_off');
    expect(entry).toBeDefined();
    expect(entry!.actor).toBe('operator');
    expect(entry!.detail).toEqual({ operatorId: 'op-jane' });
  });

  test('throws when the session is not paused', () => {
    const registry = new SessionRegistry();
    registry.create('s1');
    registry.startRun('s1', 'run-1');

    expect(() => handOff(registry, 's1', 'op-jane')).toThrow('must be "paused"');
  });

  test('throws when there is no open intervention', () => {
    const registry = new SessionRegistry();
    registry.create('s1');
    registry.startRun('s1', 'run-1');
    registry.transition('s1', 'paused', 'system');

    expect(() => handOff(registry, 's1', 'op-jane')).toThrow('no open intervention');
  });
});

describe('handBack', () => {
  test('returns control to the system and re-pauses', () => {
    const { registry } = pausedSession();
    handOff(registry, 's1', 'op-jane');
    const session = handBack(registry, 's1', 'op-jane');

    expect(session.state).toBe('paused');
    expect(session.controlToken.heldBy).toBe('system');
  });

  test('does not resume the run on its own', () => {
    const { registry } = pausedSession();
    handOff(registry, 's1', 'op-jane');
    handBack(registry, 's1', 'op-jane');

    const session = registry.get('s1');
    expect(session.state).not.toBe('running');
    expect(session.ledger.some((e) => e.action === 'run_resumed')).toBe(false);
  });

  test('records the hand back in the ledger', () => {
    const { registry } = pausedSession();
    handOff(registry, 's1', 'op-jane');
    handBack(registry, 's1', 'op-jane');

    const entry = registry.get('s1').ledger.find((e) => e.action === 'handed_back');
    expect(entry).toBeDefined();
    expect(entry!.detail).toEqual({ operatorId: 'op-jane' });
  });

  test('throws when the session was never handed off', () => {
    const { registry } = pausedSession();
    expect(() => handBack(registry, 's1', 'op-jane')).toThrow('must be "handed_off"');
  });
});

describe('resolveIntervention', () => {
  test('resolves the intervention and returns the session to running', () => {
    const { registry } = pausedSession();
    handOff(registry, 's1', 'op-jane');
    handBack(registry, 's1', 'op-jane');
    const session = resolveIntervention(registry, 's1');

    expect(session.state).toBe('running');
    expect(session.controlToken.heldBy).toBe('system');
    expect(session.interventions[0]!.state).toBe('resolved');
  });

  test('records the resume in the ledger', () => {
    const { registry } = pausedSession();
    handOff(registry, 's1', 'op-jane');
    handBack(registry, 's1', 'op-jane');
    resolveIntervention(registry, 's1');

    const entry = registry.get('s1').ledger.find((e) => e.action === 'run_resumed');
    expect(entry).toBeDefined();
    expect(entry!.detail).toEqual({ runId: 'run-1' });
  });

  test('throws when the session is still handed off', () => {
    const { registry } = pausedSession();
    handOff(registry, 's1', 'op-jane');

    expect(() => resolveIntervention(registry, 's1')).toThrow('must be "paused"');
  });
});

describe('full escalation cycle', () => {
  test('ledger records the whole handoff in order, tagged by actor', () => {
    const { registry } = pausedSession();
    handOff(registry, 's1', 'op-jane');
    handBack(registry, 's1', 'op-jane');
    resolveIntervention(registry, 's1');
    registry.completeRun('s1');

    const trail = registry.get('s1').ledger.map((e) => [e.action, e.actor]);
    expect(trail).toEqual([
      ['session_created', 'system'],
      ['run_started', 'system'],
      ['intervention_raised', 'system'],
      ['handed_off', 'operator'],
      ['handed_back', 'operator'],
      ['run_resumed', 'system'],
      ['run_completed', 'system'],
    ]);
  });
});
