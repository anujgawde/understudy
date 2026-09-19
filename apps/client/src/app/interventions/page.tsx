import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { MicroBadge } from '@/components/micro-badge';
import { interventions } from '@/fixtures';
import type { Intervention } from '@/types';

function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function sinceRaised(raisedAt: string) {
  const seconds = Math.max(0, Math.round((Date.parse('2026-09-16T14:24:45Z') - Date.parse(raisedAt)) / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${clock(seconds % 3600)}`;
}

function InterventionRow({ intervention }: { intervention: Intervention }) {
  const remaining = intervention.sessionSecondsLeft / intervention.sessionSecondsTotal;
  const critical = intervention.severity === 'critical';

  return (
    <div className={`border bg-panel ${critical ? 'border-red-line' : 'border-line'}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_150px_132px] gap-4 items-center px-4 py-3 border-b border-line-soft">
        <div className="min-w-0 flex flex-col gap-[5px]">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-[11px] text-ink-mute">{intervention.interventionId}</span>
            {intervention.badges.map((badge) => (
              <MicroBadge key={badge} hue={critical ? 'red' : 'amber'}>
                {badge}
              </MicroBadge>
            ))}
          </div>
          <div className="text-[14.5px] font-semibold -tracking-[0.01em] text-ink">
            {intervention.headline}
          </div>
          <div className="text-[12.5px] leading-[1.5] text-ink-body">{intervention.message}</div>
          <div className="flex gap-4 font-mono text-[10.5px] text-ink-mute flex-wrap mt-0.5">
            <span>
              {intervention.context.capabilityId} v{intervention.context.capabilityVersion}
            </span>
            <span>
              step {intervention.context.stepNumber}/{intervention.context.totalSteps}
            </span>
            <span>{intervention.context.tenant}</span>
            <span>raised {sinceRaised(intervention.raisedAt)} ago</span>
          </div>
        </div>

        <div className="flex flex-col gap-[5px]">
          <div className="type-micro-label">Session left</div>
          <div
            className={`font-mono text-[17px] font-semibold ${critical ? 'text-red-deep' : 'text-ink'}`}
          >
            {clock(intervention.sessionSecondsLeft)}
          </div>
          <div className="h-[3px] bg-track">
            <div
              className={`h-[3px] ${critical ? 'bg-red-ink' : 'bg-amber-ink'}`}
              style={{ width: `${Math.round(remaining * 100)}%` }}
            />
          </div>
        </div>

        <Link
          href={`/interventions/${intervention.interventionId}`}
          className="px-3.5 py-[9px] bg-operator-control-ground text-operator-control-text text-[12.5px] font-semibold text-center"
        >
          {intervention.actionLabel}
        </Link>
      </div>

      {critical && (
        <div className="px-4 py-[11px] bg-panel-head text-xs leading-[1.5] text-ink-body">
          Everything an operator needs to act is on the row: which capability, which step, why it
          stopped, and how long they have. Opening the session should not be how you find out what
          the job is.
        </div>
      )}
    </div>
  );
}

export default function InterventionInboxPage() {
  const ordered = [...interventions].sort(
    (left, right) => left.sessionSecondsLeft - right.sessionSecondsLeft,
  );

  return (
    <AppShell active="interventions">
      <header className="px-[26px] pt-[18px] pb-[15px] bg-panel border-b border-line flex gap-5 items-end">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="type-section-label">S8</div>
          <h1 className="type-page-heading">Interventions</h1>
          <p className="text-[13px] text-ink-mute">
            Sessions paused and waiting for a person. Ordered by time remaining, not by arrival — a
            session that expires is a run lost.
          </p>
        </div>
        <div className="flex gap-[7px] flex-none">
          <span className="px-2.5 py-[5px] border border-ink bg-ink text-button-primary-text font-mono text-[11px]">
            open · {ordered.length}
          </span>
          <span className="px-2.5 py-[5px] border border-line bg-panel font-mono text-[11px] text-ink-body">
            mine · 0
          </span>
          <span className="px-2.5 py-[5px] border border-line bg-panel font-mono text-[11px] text-ink-body">
            resolved today · 9
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 px-[26px] py-[18px] flex flex-col gap-3.5">
        {ordered.map((intervention) => (
          <InterventionRow key={intervention.interventionId} intervention={intervention} />
        ))}

        <div className="mt-auto px-[17px] py-[15px] border border-dashed border-line bg-panel-head grid grid-cols-3 gap-5">
          <div className="min-w-0">
            <div className="type-section-label mb-1.5">Why it stopped — the three triggers</div>
            <div className="text-xs leading-[1.55] text-ink-body">
              An undeclared state, a policy denial, or a risky step awaiting authorisation. Each
              carries different context, so each renders a different row emphasis.
            </div>
          </div>
          <div className="min-w-0">
            <div className="type-section-label mb-1.5">Why the clock is loud</div>
            <div className="text-xs leading-[1.55] text-ink-body">
              The handoff holds a real authenticated session open. The SLA is bounded by the
              app&rsquo;s own session lifetime, not by our preference.
            </div>
          </div>
          <div className="min-w-0">
            <div className="type-section-label mb-1.5">What happens on expiry</div>
            <div className="text-xs leading-[1.55] text-ink-body">
              The run is abandoned with a typed reason and the caller is told. Abandoning cleanly
              beats timing out ambiguously.
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
