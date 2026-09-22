import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Panel } from '@/components/panel';
import { getIntervention, getLedger } from '@/lib/data';
import type { LedgerEntry } from '@/types';

const actorChips: Record<LedgerEntry['actor'], string> = {
  model: 'bg-chip-navigate text-chip-navigate-text',
  system: 'bg-chip-submit text-chip-submit-text',
  operator: 'bg-amber-ink text-white',
  paused: 'bg-chip-click text-chip-click-text',
};

const actorLabels: Record<LedgerEntry['actor'], string> = {
  model: 'agent',
  system: 'system',
  operator: 'human',
  paused: 'paused',
};

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2.5 items-start px-[13px] py-[9px] border-b border-line-soft last:border-b-0">
      <div className="font-mono text-[10px] text-ink-mute pt-0.5">{entry.occurredAt}</div>
      <div className="flex gap-[7px] items-baseline">
        <span
          className={`font-mono text-[9px] tracking-[0.04em] uppercase px-[5px] py-px flex-none ${actorChips[entry.actor]}`}
        >
          {actorLabels[entry.actor]}
        </span>
        <span className="text-xs leading-[1.4] text-ink">{entry.summary}</span>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="type-micro-label">{label}</div>
      <div className="font-mono text-[11.5px] text-ink-body break-all">{value ?? '—'}</div>
    </div>
  );
}

export default async function TakeoverPage({
  params,
}: {
  params: Promise<{ interventionId: string }>;
}) {
  const { interventionId } = await params;
  const intervention = await getIntervention(interventionId);
  if (!intervention) notFound();

  const ledger = await getLedger();
  const { context } = intervention;
  const critical = intervention.severity === 'critical';

  return (
    <AppShell active="interventions">
      <header className="px-[26px] pt-[18px] pb-[15px] bg-panel border-b border-line flex gap-5 items-end">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="type-section-label">S9</div>
          <h1 className="type-page-heading">{intervention.message}</h1>
          <p className="text-[13px] text-ink-mute">
            {intervention.failureCode} · raised {new Date(intervention.raisedAt).toLocaleString('en-GB')} ·{' '}
            {intervention.state}
          </p>
        </div>
        <Link
          href="/interventions"
          className="px-3.5 py-[9px] border border-line bg-panel text-[12.5px] text-ink-body flex-none"
        >
          Back to inbox
        </Link>
      </header>

      <div className="flex-1 min-h-0 px-[26px] py-[18px] grid grid-cols-[minmax(0,1fr)_380px] gap-4 items-start overflow-auto">
        <div className="flex flex-col gap-4 min-w-0">
          <Panel title="What the operator is inheriting">
            <div className="p-[15px] grid grid-cols-2 gap-x-5 gap-y-3.5">
              <Field label="Capability" value={context.capabilityId} />
              <Field
                label="Version"
                value={context.capabilityVersion ? `v${context.capabilityVersion}` : undefined}
              />
              <Field
                label="Stopped at"
                value={
                  context.stepNumber && context.totalSteps
                    ? `${context.failedAtStepId} (step ${context.stepNumber} of ${context.totalSteps})`
                    : context.failedAtStepId
                }
              />
              <Field label="Last successful step" value={context.lastSuccessfulStepId} />
              <Field label="Page" value={context.pageUrl} />
              <Field label="Run" value={context.runId} />
              <Field label="Session" value={intervention.sessionId} />
              <Field label="Evidence" value={intervention.evidencePath} />
            </div>
          </Panel>

          <Panel title="Session ledger">
            {ledger.length > 0 ? (
              <div>
                {ledger.map((entry) => (
                  <LedgerRow key={entry.entryId} entry={entry} />
                ))}
              </div>
            ) : (
              <div className="p-[15px] text-xs leading-[1.55] text-ink-body">
                No handoff has been recorded yet. Running{' '}
                <span className="font-mono">npm run handoff</span> escalates a run, transfers the
                live session to an operator and writes the ledger beside it.
              </div>
            )}
            <div className="px-[15px] py-[11px] bg-panel-head border-t border-line-soft text-xs leading-[1.5] text-ink-body">
              Every transfer of control and everything the operator did while they held it, tagged
              with who did it. Values typed by the operator are deliberately not stored — what they
              typed is as likely to be a credential as anything else.
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <Panel title="The page it stopped on">
            {context.screenshotPath ? (
              <div className="p-[13px] flex flex-col gap-2">
                <div className="border border-line bg-panel-head px-3 py-2 font-mono text-[10.5px] text-ink-mute break-all">
                  {context.screenshotPath}
                </div>
                <div className="text-xs leading-[1.5] text-ink-body">
                  Captured at the moment the run escalated, with the values the policy redacts
                  already masked.
                </div>
              </div>
            ) : (
              <div className="p-[15px] text-xs leading-[1.55] text-ink-body">
                No frame was captured for this intervention.
              </div>
            )}
          </Panel>

          <Panel title="Control transfer">
            <div className="p-[15px] flex flex-col gap-2.5">
              <div
                className={`px-3 py-2 border text-[12.5px] ${critical ? 'border-red-line text-red-deep' : 'border-line text-ink-body'}`}
              >
                Severity: {intervention.severity}
              </div>
              <p className="text-xs leading-[1.55] text-ink-body">
                Taking control is a real transfer on the live session, not a new one. Operator input
                is refused until the token moves, so there is never a moment where the automation
                and a person could both act on the page.
              </p>
              <p className="text-xs leading-[1.55] text-ink-body">
                On hand-back the checkpoints of the last successful step are re-asserted before the
                run is allowed to continue — the operator could have navigated anywhere.
              </p>
              <div className="px-3 py-2 bg-panel-head border border-dashed border-line font-mono text-[11px] text-ink-body break-all">
                npm run handoff {'<artifact>'} --input memberNumber=77777
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
