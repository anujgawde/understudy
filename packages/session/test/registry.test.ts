import { describe, test, expect } from 'vitest';
import { SessionRegistry } from '../src/registry.js';

describe('SessionRegistry', () => {
  test('create initialises an idle session owned by system', () => {
    const registry = new SessionRegistry();
    const session = registry.create('s1');

    expect(session.sessionId).toBe('s1');
    expect(session.state).toBe('idle');
    expect(session.controlToken.heldBy).toBe('system');
    expect(session.ledger).toHaveLength(1);
    expect(session.ledger[0]!.action).toBe('session_created');
  });

  test('duplicate session id throws', () => {
    const registry = new SessionRegistry();
    registry.create('s1');
    expect(() => registry.create('s1')).toThrow('already exists');
  });

  test('get returns the session', () => {
    const registry = new SessionRegistry();
    registry.create('s1');
    expect(registry.get('s1').sessionId).toBe('s1');
  });

  test('get throws for unknown session', () => {
    const registry = new SessionRegistry();
    expect(() => registry.get('nope')).toThrow('not found');
  });

  test('has reports presence', () => {
    const registry = new SessionRegistry();
    expect(registry.has('s1')).toBe(false);
    registry.create('s1');
    expect(registry.has('s1')).toBe(true);
  });

  describe('state machine transitions', () => {
    test('idle → running', () => {
      const registry = new SessionRegistry();
      registry.create('s1');
      const session = registry.transition('s1', 'running', 'system');
      expect(session.state).toBe('running');
      expect(session.controlToken.heldBy).toBe('system');
    });

    test('running → paused', () => {
      const registry = new SessionRegistry();
      registry.create('s1');
      registry.transition('s1', 'running', 'system');
      const session = registry.transition('s1', 'paused', 'system');
      expect(session.state).toBe('paused');
    });

    test('paused → handed_off', () => {
      const registry = new SessionRegistry();
      registry.create('s1');
      registry.transition('s1', 'running', 'system');
      registry.transition('s1', 'paused', 'system');
      const session = registry.transition('s1', 'handed_off', 'operator');
      expect(session.state).toBe('handed_off');
      expect(session.controlToken.heldBy).toBe('operator');
    });

    test('running → idle (complete)', () => {
      const registry = new SessionRegistry();
      registry.create('s1');
      registry.transition('s1', 'running', 'system');
      const session = registry.transition('s1', 'idle', 'system');
      expect(session.state).toBe('idle');
    });

    test('paused → running (resume without handoff)', () => {
      const registry = new SessionRegistry();
      registry.create('s1');
      registry.transition('s1', 'running', 'system');
      registry.transition('s1', 'paused', 'system');
      const session = registry.transition('s1', 'running', 'system');
      expect(session.state).toBe('running');
    });

    test('invalid transition throws', () => {
      const registry = new SessionRegistry();
      registry.create('s1');
      expect(() => registry.transition('s1', 'paused', 'system')).toThrow('Invalid transition');
      expect(() => registry.transition('s1', 'handed_off', 'operator')).toThrow(
        'Invalid transition',
      );
    });

    test('handed_off → idle (abort)', () => {
      const registry = new SessionRegistry();
      registry.create('s1');
      registry.transition('s1', 'running', 'system');
      registry.transition('s1', 'paused', 'system');
      registry.transition('s1', 'handed_off', 'operator');
      const session = registry.transition('s1', 'idle', 'system');
      expect(session.state).toBe('idle');
    });
  });

  test('startRun transitions to running and records ledger', () => {
    const registry = new SessionRegistry();
    registry.create('s1');
    const session = registry.startRun('s1', 'run-1', 'cap-1');
    expect(session.state).toBe('running');
    expect(session.runId).toBe('run-1');
    expect(session.capabilityId).toBe('cap-1');

    const runEntry = session.ledger.find((e) => e.action === 'run_started');
    expect(runEntry).toBeDefined();
    expect(runEntry!.detail).toEqual({ runId: 'run-1', capabilityId: 'cap-1' });
  });

  test('completeRun transitions to idle and clears run state', () => {
    const registry = new SessionRegistry();
    registry.create('s1');
    registry.startRun('s1', 'run-1', 'cap-1');
    const session = registry.completeRun('s1');
    expect(session.state).toBe('idle');
    expect(session.runId).toBeUndefined();
    expect(session.capabilityId).toBeUndefined();

    const completeEntry = session.ledger.find((e) => e.action === 'run_completed');
    expect(completeEntry).toBeDefined();
  });

  test('ledger is append-only and entries have unique ids', () => {
    const registry = new SessionRegistry();
    const session = registry.create('s1');
    registry.startRun('s1', 'run-1');
    registry.completeRun('s1');

    expect(session.ledger.length).toBeGreaterThanOrEqual(3);
    const ids = session.ledger.map((e) => e.entryId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('listSessions returns all sessions', () => {
    const registry = new SessionRegistry();
    registry.create('s1');
    registry.create('s2');
    expect(registry.listSessions()).toHaveLength(2);
  });
});
