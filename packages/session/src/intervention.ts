import type { FailureCode } from '@understudy/schemas';
import {
  ESCALATION_WORTHY_FAILURES,
  type Intervention,
  type InterventionSeverity,
  type RaiseInterventionOptions,
} from './types.js';

function severityFor(failureCode: FailureCode): InterventionSeverity {
  if (failureCode === 'session_expired' || failureCode === 'timeout') return 'critical';
  return 'warning';
}

export function shouldEscalate(failureCode: FailureCode): boolean {
  return ESCALATION_WORTHY_FAILURES.has(failureCode);
}

export function raiseIntervention(options: RaiseInterventionOptions): Intervention {
  const { registry, sessionId, failureCode, message } = options;

  const session = registry.get(sessionId);

  if (session.state !== 'running') {
    throw new Error(
      `Cannot raise intervention on session "${sessionId}" in state "${session.state}" (must be "running")`,
    );
  }

  registry.transition(sessionId, 'paused', 'system');

  const intervention: Intervention = {
    interventionId: crypto.randomUUID(),
    sessionId,
    raisedAt: new Date().toISOString(),
    severity: severityFor(failureCode),
    state: 'raised',
    failureCode,
    failedAtStepId: options.failedAtStepId,
    message,
    context: {
      runId: options.runId,
      capabilityId: options.capabilityId,
      pageUrl: options.pageUrl,
      lastSuccessfulStepId: options.lastSuccessfulStepId,
    },
  };

  session.interventions.push(intervention);
  registry.appendLedger(session, 'system', 'intervention_raised', {
    interventionId: intervention.interventionId,
    failureCode,
    severity: intervention.severity,
  });

  return intervention;
}
