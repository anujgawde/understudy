import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { OutcomeBanner } from '@/components/outcome-banner';
import { Panel } from '@/components/panel';
import { StepTimeline } from '@/components/step-timeline';
import { getReplayRun, getReplayRuns } from '@/lib/data';
import type { Outcome, OutcomeClassification, RunLog } from '@/types';

const classifications: OutcomeClassification[] = [
  'success',
  'business_outcome',
  'recovered',
  'failed',
];

function secondsBetween(startedAt: string, completedAt?: string) {
  if (!completedAt) return '—';
  const milliseconds = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function bannerCopy(run: RunLog, outcome: Outcome) {
  const elapsed = secondsBetween(run.startedAt, run.completedAt);
  const onPrimaryRung = run.timeline.every(
    (step) => step.resolvedByIndex === undefined || step.resolvedByIndex === 0,
  );

  switch (outcome.classification) {
    case 'success':
      return {
        eyebrow: 'success',
        verdict: 'Checkpoint verified, all outputs extracted',
        detail: `${run.timeline.length} of ${run.timeline.length} steps executed${
          onPrimaryRung ? ' on their primary locator. No fallbacks used' : ''
        }, no model calls made.`,
        metadata: [`${elapsed} total`, `${run.modelCalls} model calls`, `caller: ${run.caller}`],
      };
    case 'business_outcome':
      return {
        eyebrow: `business_outcome · ${outcome.code.toUpperCase()}`,
        verdict: 'The system worked. The answer is “no such member.”',
        detail: `${outcome.message}. This is a declared outcome on the artifact, so it is returned to the caller as data rather than thrown as an error.`,
        metadata: [`${elapsed} total`, 'no escalation', 'evidence captured'],
      };
    case 'recovered':
      return {
        eyebrow: `recovered · ${outcome.recoveredFrom.toUpperCase()}`,
        verdict: 'Succeeded, but the surface misbehaved on the way',
        detail: `Recovered from ${outcome.recoveredFrom.replace(/_/g, ' ')} after ${outcome.attempts} attempts. The outputs are good, but steps resolving on lower rungs is a drift signal worth reading before it becomes a failure.`,
        metadata: [`${elapsed} total`, `${outcome.attempts} attempts`, 'evidence captured'],
      };
    case 'failed':
      return {
        eyebrow: `failed · ${outcome.failureCode.toUpperCase()}`,
        verdict: `Stopped at ${outcome.failedAtStepId ?? 'an undeclared state'} — our bug, not the app's answer`,
        detail: outcome.message,
        metadata: [
          `${elapsed} to halt`,
          run.interventionId ? `escalated → ${run.interventionId}` : 'not escalated',
          'evidence captured',
        ],
      };
  }
}

function callerPayload(run: RunLog, outcome: Outcome) {
  const envelope = {
    outcome: outcome.classification,
    capability: run.capabilityId,
    version: run.capabilityVersion,
  };

  switch (outcome.classification) {
    case 'success':
      return {
        ...envelope,
        outputs: outcome.outputs,
        checkpoint: 'passed',
        evidence: run.evidencePath,
      };
    case 'business_outcome':
      return { ...envelope, code: outcome.code, message: outcome.message, evidence: run.evidencePath };
    case 'recovered':
      return {
        ...envelope,
        outputs: outcome.outputs,
        recoveredFrom: outcome.recoveredFrom,
        attempts: outcome.attempts,
        evidence: run.evidencePath,
      };
    case 'failed':
      return {
        ...envelope,
        code: outcome.failureCode,
        failedStep: outcome.failedAtStepId,
        intervention: run.interventionId,
        evidence: run.evidencePath,
      };
  }
}

function CallPanel({ run }: { run: RunLog }) {
  const rows = [
    ['capability', run.capabilityId],
    ['version pinned', `v${run.capabilityVersion} · sha ${run.artifactSha}`],
    ['tenant', run.tenant],
    ['inputs', Object.entries(run.inputs).map(([key, value]) => `${key}: ${value}`).join(', ')],
  ];

  return (
    <Panel label="Call">
      <div className="flex flex-col gap-[9px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-[12.5px]">
            <span className="text-ink-mute">{label}</span>
            <span className="font-mono text-[11.5px] text-ink text-right">{value}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3 text-[12.5px]">
          <span className="text-ink-mute">model calls</span>
          <span className="font-mono text-[11.5px] text-green-deep text-right">
            {run.modelCalls} — deterministic path
          </span>
        </div>
      </div>
    </Panel>
  );
}

function FailureEvidencePanel({ run }: { run: RunLog }) {
  if (!run.failureEvidence) return null;

  return (
    <Panel label={`Failure evidence — ${run.failureEvidence.atStepId}`}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-[11px]">
          <div className="border border-line-soft px-3 py-2.5 flex flex-col gap-[5px]">
            <div className="type-micro-label">Expected</div>
            <div className="font-mono text-[11px] leading-[1.5] text-green-deep">
              {run.failureEvidence.expected}
            </div>
          </div>
          <div className="border border-line-soft px-3 py-2.5 flex flex-col gap-[5px]">
            <div className="type-micro-label">Observed</div>
            <div className="font-mono text-[11px] leading-[1.5] text-red-deep">
              {run.failureEvidence.observed}
            </div>
          </div>
        </div>

        <div className="h-[158px] border border-line flex items-center justify-center bg-[repeating-linear-gradient(135deg,var(--color-chip-click)_0_8px,var(--color-button-secondary-hover)_8px_16px)]">
          <span className="font-mono text-[10.5px] text-ink-body bg-panel px-2.5 py-1.5 border border-line">
            failure screenshot — auto-redacted
          </span>
        </div>

        <div className="flex gap-[7px] flex-wrap">
          <span className="px-2.5 py-1.5 border border-line font-mono text-[11px] text-ink-body">
            DOM snapshot
          </span>
          <span className="px-2.5 py-1.5 border border-line font-mono text-[11px] text-ink-body">
            step trace
          </span>
          <span className="px-2.5 py-1.5 border border-amber-ink bg-amber-wash text-amber-deep font-mono text-[11px] font-medium">
            open intervention →
          </span>
        </div>
      </div>
    </Panel>
  );
}

export default async function ReplayResultPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = await getReplayRun(runId);
  if (!run?.outcome) notFound();

  const allRuns = await getReplayRuns(run.capabilityId);
  const outcome = run.outcome;
  const copy = bannerCopy(run, outcome);
  const failed = outcome.classification === 'failed';

  return (
    <AppShell active="replays">
      <header className="px-[26px] pt-4 pb-3.5 bg-panel border-b border-line">
        <div className="flex items-center gap-[7px] font-mono text-[11px] text-ink-mute mb-2.5">
          <span className="text-blue-ink">replays</span>
          <span>/</span>
          <span>{run.runId}</span>
        </div>
        <div className="flex gap-[18px] items-end">
          <div className="flex-1 min-w-0">
            <h1 className="type-page-heading">Replay result</h1>
            <p className="mt-[5px] text-[13px] text-ink-mute">
              Triggered by an agent tool call. No human in this path.
            </p>
          </div>
          <div className="flex border border-line bg-panel flex-none">
            {classifications.map((classification) => {
              const variant = allRuns.find(
                (one) => one.outcome?.classification === classification,
              );
              const isActive = classification === outcome.classification;
              const className = `px-[11px] py-1.5 font-mono text-[11px] border-line first:border-l-0 border-l ${
                isActive
                  ? 'bg-ink text-button-primary-text font-semibold'
                  : 'text-ink-body hover:bg-button-secondary-hover'
              }`;

              return variant && !isActive ? (
                <Link key={classification} href={`/replays/${variant.runId}`} className={className}>
                  {classification}
                </Link>
              ) : (
                <span key={classification} className={className}>
                  {classification}
                </span>
              );
            })}
          </div>
        </div>
      </header>

      <div className="px-[26px] pt-[18px]">
        <OutcomeBanner
          outcome={outcome}
          eyebrow={copy.eyebrow}
          verdict={copy.verdict}
          detail={copy.detail}
          metadata={copy.metadata}
        />
      </div>

      <div className="flex-1 min-h-0 px-[26px] py-[18px] grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-[18px] items-start">
        <div className="min-w-0 flex flex-col gap-4">
          {failed ? <FailureEvidencePanel run={run} /> : <CallPanel run={run} />}

          <Panel
            label={failed ? 'Error payload returned to caller' : 'Result payload returned to caller'}
          >
            <pre className="font-mono text-[11.5px] leading-[1.75] text-ink overflow-hidden">
              {JSON.stringify(callerPayload(run, outcome), null, 2)}
            </pre>
          </Panel>

          {!failed && (
            <Panel>
              <p className="text-xs leading-[1.55] text-ink-body">
                Outputs are typed at the boundary: the balance is a number, not the string{' '}
                <span className="font-mono text-[11.5px]">&quot;$4,182.90&quot;</span>, and the
                account number is masked before it ever leaves the extractor. A caller should never
                have to parse or sanitise what a capability returns.
              </p>
            </Panel>
          )}
        </div>

        <Panel
          label="Step timeline"
          meta={run.timeline.every((step) => step.state === 'passed') ? 'rung 1 throughout' : undefined}
          className="min-w-0 w-full"
        >
          <div className="-mx-[15px] -my-3.5">
            <StepTimeline
              steps={run.timeline}
              footnote="Every step records the rung it resolved on. All-green rung 1 is the healthy signature; a run that succeeds on lower rungs still succeeds, but changes this column."
            />
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
