import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { MicroBadge } from '@/components/micro-badge';
import { getInterventions } from '@/lib/data';
import type { Intervention } from '@/types';

function raisedAt(timestamp: string) {
  return new Date(timestamp).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function InterventionRow({ intervention }: { intervention: Intervention }) {
  const critical = intervention.severity === 'critical';
  const { context } = intervention;

  return (
    <div className={`border bg-panel ${critical ? 'border-red-line' : 'border-line'}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_150px_132px] gap-4 items-center px-4 py-3 border-b border-line-soft">
        <div className="min-w-0 flex flex-col gap-[5px]">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-[11px] text-ink-mute">
              {intervention.interventionId.slice(0, 8)}
            </span>
            <MicroBadge hue={critical ? 'red' : 'amber'}>{intervention.failureCode}</MicroBadge>
            <MicroBadge hue="neutral">{intervention.state}</MicroBadge>
          </div>
          <div className="text-[14.5px] font-semibold -tracking-[0.01em] text-ink">
            {intervention.message}
          </div>
          <div className="flex gap-4 font-mono text-[10.5px] text-ink-mute flex-wrap mt-0.5">
            {context.capabilityId && (
              <span>
                {context.capabilityId}
                {context.capabilityVersion ? ` v${context.capabilityVersion}` : ''}
              </span>
            )}
            {context.stepNumber && context.totalSteps && (
              <span>
                step {context.stepNumber}/{context.totalSteps}
              </span>
            )}
            {context.lastSuccessfulStepId && <span>last ok · {context.lastSuccessfulStepId}</span>}
            <span>raised {raisedAt(intervention.raisedAt)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-[5px] min-w-0">
          <div className="type-micro-label">Stopped on</div>
          <div className="font-mono text-[11px] text-ink-body truncate" title={context.pageUrl}>
            {context.pageUrl ?? 'unknown page'}
          </div>
          {context.screenshotPath && (
            <div className="font-mono text-[10.5px] text-ink-mute">frame captured</div>
          )}
        </div>

        <Link
          href={`/interventions/${intervention.interventionId}`}
          className="px-3.5 py-[9px] bg-operator-control-ground text-operator-control-text text-[12.5px] font-semibold text-center"
        >
          Take control
        </Link>
      </div>
    </div>
  );
}

export default async function InterventionInboxPage() {
  const interventions = await getInterventions();
  const open = interventions.filter((one) => one.state !== 'resolved');

  return (
    <AppShell active="interventions">
      <header className="px-[26px] pt-[18px] pb-[15px] bg-panel border-b border-line flex gap-5 items-end">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="type-section-label">S8</div>
          <h1 className="type-page-heading">Interventions</h1>
          <p className="text-[13px] text-ink-mute">
            Runs that stopped and raised a request for a person, read from the evidence they were
            written beside.
          </p>
        </div>
        <div className="flex gap-[7px] flex-none">
          <span className="px-2.5 py-[5px] border border-ink bg-ink text-button-primary-text font-mono text-[11px]">
            open · {open.length}
          </span>
          <span className="px-2.5 py-[5px] border border-line bg-panel font-mono text-[11px] text-ink-body">
            recorded · {interventions.length}
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 px-[26px] py-[18px] flex flex-col gap-3.5">
        {interventions.map((intervention) => (
          <InterventionRow key={intervention.interventionId} intervention={intervention} />
        ))}

        {interventions.length === 0 && (
          <div className="px-[17px] py-[15px] border border-dashed border-line bg-panel-head">
            <div className="type-section-label mb-1.5">Nothing has escalated</div>
            <div className="text-xs leading-[1.55] text-ink-body">
              No run in <span className="font-mono">evidence/</span> has raised an intervention. A
              replay that hits a condition it cannot recover from writes one beside its run log —
              try <span className="font-mono">npm run handoff</span>, or replay member 77777, whose
              session expires mid-run.
            </div>
          </div>
        )}

        <div className="mt-auto px-[17px] py-[15px] border border-dashed border-line bg-panel-head grid grid-cols-3 gap-5">
          <div className="min-w-0">
            <div className="type-section-label mb-1.5">What reaches this screen</div>
            <div className="text-xs leading-[1.55] text-ink-body">
              Only failures a person could act on from inside the session. A broken locator is an
              artifact to re-record, not a job for an operator, so it never appears here.
            </div>
          </div>
          <div className="min-w-0">
            <div className="type-section-label mb-1.5">Why the row carries context</div>
            <div className="text-xs leading-[1.55] text-ink-body">
              Which capability, which step, what was last known good, and the page it stopped on.
              Opening the session should not be how you find out what the job is.
            </div>
          </div>
          <div className="min-w-0">
            <div className="type-section-label mb-1.5">Taking control</div>
            <div className="text-xs leading-[1.55] text-ink-body">
              Control transfers on the live session, and input is refused until it does. Everything
              the operator then does is recorded in the session ledger as evidence.
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
