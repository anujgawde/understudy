import { describe, test, expect } from 'vitest';
import { SessionRegistry } from '../src/registry.js';
import { raiseIntervention, shouldEscalate } from '../src/intervention.js';

describe('shouldEscalate', () => {
  test('timeout and session_expired are escalation-worthy', () => {
    expect(shouldEscalate('timeout')).toBe(true);
    expect(shouldEscalate('session_expired')).toBe(true);
  });

  test('assertion_failed and navigation_failed are escalation-worthy', () => {
    expect(shouldEscalate('assertion_failed')).toBe(true);
    expect(shouldEscalate('navigation_failed')).toBe(true);
  });

  test('locator_not_found is not escalation-worthy', () => {
    expect(shouldEscalate('locator_not_found')).toBe(false);
  });

  test('extraction_failed is not escalation-worthy', () => {
    expect(shouldEscalate('extraction_failed')).toBe(false);
  });

  test('type_coercion_failed is not escalation-worthy', () => {
    expect(shouldEscalate('type_coercion_failed')).toBe(false);
  });
});

describe('raiseIntervention', () => {
  function runningSession(registry: SessionRegistry, sessionId = 's1') {
    registry.create(sessionId);
    registry.startRun(sessionId, 'run-1', 'cap-1');
  }

  test('pauses the session and returns an intervention', () => {
    const registry = new SessionRegistry();
    runningSession(registry);

    const intervention = raiseIntervention({
      registry,
      sessionId: 's1',
      runId: 'run-1',
      capabilityId: 'cap-1',
      failureCode: 'timeout',
      failedAtStepId: 'step-3',
      lastSuccessfulStepId: 'step-2',
      message: 'Page timed out after 30s',
      pageUrl: 'http://localhost:3000/dashboard',
    });

    expect(intervention.sessionId).toBe('s1');
    expect(intervention.state).toBe('raised');
    expect(intervention.severity).toBe('critical');
    expect(intervention.failureCode).toBe('timeout');
    expect(intervention.failedAtStepId).toBe('step-3');
    expect(intervention.context.runId).toBe('run-1');
    expect(intervention.context.lastSuccessfulStepId).toBe('step-2');
    expect(intervention.context.pageUrl).toBe('http://localhost:3000/dashboard');

    const session = registry.get('s1');
    expect(session.state).toBe('paused');
    expect(session.interventions).toHaveLength(1);
    expect(session.interventions[0]!.interventionId).toBe(intervention.interventionId);
  });

  test('assertion_failed gets warning severity', () => {
    const registry = new SessionRegistry();
    runningSession(registry);

    const intervention = raiseIntervention({
      registry,
      sessionId: 's1',
      runId: 'run-1',
      failureCode: 'assertion_failed',
      message: 'Checkpoint failed',
    });

    expect(intervention.severity).toBe('warning');
  });

  test('session_expired gets critical severity', () => {
    const registry = new SessionRegistry();
    runningSession(registry);

    const intervention = raiseIntervention({
      registry,
      sessionId: 's1',
      runId: 'run-1',
      failureCode: 'session_expired',
      message: 'Session expired',
    });

    expect(intervention.severity).toBe('critical');
  });

  test('appends a ledger entry with intervention details', () => {
    const registry = new SessionRegistry();
    runningSession(registry);

    const intervention = raiseIntervention({
      registry,
      sessionId: 's1',
      runId: 'run-1',
      failureCode: 'timeout',
      message: 'Timed out',
    });

    const session = registry.get('s1');
    const ledgerEntry = session.ledger.find((e) => e.action === 'intervention_raised');
    expect(ledgerEntry).toBeDefined();
    expect(ledgerEntry!.detail).toEqual({
      interventionId: intervention.interventionId,
      failureCode: 'timeout',
      severity: 'critical',
    });
  });

  test('throws when session is not running', () => {
    const registry = new SessionRegistry();
    registry.create('s1');

    expect(() =>
      raiseIntervention({
        registry,
        sessionId: 's1',
        runId: 'run-1',
        failureCode: 'timeout',
        message: 'Timed out',
      }),
    ).toThrow('must be "running"');
  });
});
