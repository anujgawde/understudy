import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { ControlBanner } from '@/components/control-banner';
import { Panel } from '@/components/panel';
import { interventions, takeoverSession } from '@/fixtures';
import type { Actor, LedgerEntry } from '@/types';

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
    <div className="grid grid-cols-[48px_1fr] gap-2.5 items-start px-[13px] py-[9px] border-b border-line-soft last:border-b-0">
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

export default async function TakeoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ interventionId: string }>;
  searchParams: Promise<{ control?: string }>;
}) {
  const { interventionId } = await params;
  const { control } = await searchParams;
  const intervention = interventions.find((one) => one.interventionId === interventionId);
  if (!intervention) notFound();

  const operatorHolds = control === 'operator';
  const heldBy: Actor = operatorHolds ? 'operator' : 'model';
  const session = takeoverSession;

  // The token never moves on its own, so the operator-side actions stay inert
  // until it does — there is never a moment where both parties could act.
  const ledger = operatorHolds
    ? [
        ...session.ledger.slice(-1),
        { entryId: 'led_6', occurredAt: '14:24:46', actor: 'operator' as const, summary: `${session.operatorName} claimed control token` },
        { entryId: 'led_7', occurredAt: '14:24:52', actor: 'operator' as const, summary: 'fill → operator id (vault, not logged)' },
        { entryId: 'led_8', occurredAt: '14:25:04', actor: 'operator' as const, summary: 'click → Sign In' },
        { entryId: 'led_9', occurredAt: '14:25:10', actor: 'system' as const, summary: 'step 5 checkpoint re-assertable — resume available' },
      ]
    : session.ledger;

  return (
    <AppShell active="interventions" operatorControl={operatorHolds}>
      <ControlBanner
        heldBy={heldBy}
        operatorName={session.operatorName}
        action={
          <Link
            href={
              operatorHolds
                ? `/interventions/${interventionId}`
                : `/interventions/${interventionId}?control=operator`
            }
            className={`px-[15px] py-2 text-[12.5px] font-semibold ${
              operatorHolds
                ? 'bg-operator-control-text text-operator-control-ground'
                : 'bg-agent-control-text text-agent-control-ground'
            }`}
          >
            {operatorHolds ? 'Hand back →' : 'Claim control'}
          </Link>
        }
      />

      <header className="px-[26px] pt-[17px] pb-3.5 bg-panel border-b border-line flex gap-5 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5 font-mono text-[11px] text-ink-mute flex-wrap">
            <span>{intervention.interventionId}</span>
            <span>·</span>
            {operatorHolds ? (
              <span className="text-amber-deep">you took control 00:00:38 ago</span>
            ) : (
              <span>raised 00:02:14 ago</span>
            )}
            <span>·</span>
            <span className="text-red-deep">session expires in 07:46</span>
          </div>
          <h1 className="type-page-heading">
            {operatorHolds
              ? 'Re-authenticate, then hand control back at the member search screen'
              : intervention.headline}
          </h1>
          <p className="text-[12.5px] leading-[1.55] text-ink-body max-w-[92ch]">
            {operatorHolds
              ? "Resume re-asserts the last checkpoint before continuing, so you do not need to land exactly where the agent left off — but you do need to be somewhere the artifact recognises."
              : session.detail}
          </p>
        </div>

        <div
          className={`flex-none w-[184px] border px-[13px] py-[11px] flex flex-col gap-[5px] ${
            operatorHolds ? 'border-amber-line bg-amber-wash' : 'border-line bg-panel-head'
          }`}
        >
          <div
            className={`font-mono text-[9px] tracking-[0.08em] uppercase ${
              operatorHolds ? 'text-amber-deep font-semibold' : 'text-ink-mute'
            }`}
          >
            Live session
          </div>
          <div className="font-mono text-[11px] leading-[1.7] text-ink-body">
            {session.sessionId} · {session.browser}
            <br />
            {operatorHolds ? 'same context, not a new one' : 'same browser context'}
            <br />
            {operatorHolds ? 'interactive' : 'cookies preserved'}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 px-[26px] py-[18px] grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-[18px] items-start">
        <div className="min-w-0 flex flex-col gap-3.5">
          <div className={`bg-panel flex flex-col ${operatorHolds ? 'border-2 border-amber-ink' : 'border border-line'}`}>
            <div
              className={`flex items-center gap-2.5 px-[13px] py-[9px] border-b ${
                operatorHolds ? 'border-amber-line bg-amber-wash' : 'border-line-soft bg-panel-head'
              }`}
            >
              <div className="font-mono text-[10.5px] text-ink-body min-w-0 truncate">
                {intervention.context.pageUrl}
              </div>
              <div className="ml-auto flex gap-1.5 font-mono text-[10px] flex-none">
                <span className="px-1.5 py-0.5 border border-line text-ink-mute">
                  {session.viewport}
                </span>
                {operatorHolds ? (
                  <span className="px-1.5 py-0.5 bg-amber-ink text-white font-semibold">
                    YOU ARE DRIVING
                  </span>
                ) : (
                  <>
                    <span className="px-1.5 py-0.5 border border-line text-ink-mute">
                      {session.transport}
                    </span>
                    <span className="px-1.5 py-0.5 border border-line text-ink-mute">read-only</span>
                  </>
                )}
              </div>
            </div>

            <div
              className={`h-[300px] flex flex-col items-center justify-center gap-2.5 p-5 ${
                operatorHolds
                  ? 'bg-[repeating-linear-gradient(135deg,var(--color-amber-wash)_0_8px,var(--color-panel-head)_8px_16px)]'
                  : 'bg-[repeating-linear-gradient(135deg,var(--color-chip-click)_0_8px,var(--color-button-secondary-hover)_8px_16px)]'
              }`}
            >
              <span className="font-mono text-[11px] text-ink-body bg-panel px-3 py-2 border border-line text-center">
                {operatorHolds
                  ? 'live session viewport — interactive, keystrokes forwarded'
                  : 'live session viewport — not interactive until you claim control'}
              </span>
              <span className="font-mono text-[10.5px] text-ink-mute text-center max-w-[46ch] leading-[1.6]">
                {operatorHolds
                  ? 'credential fields suppress screenshot capture while focused'
                  : 'mocked deliberately — the handoff mechanism is real, the pixel transport is a documented seam'}
              </span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {operatorHolds ? (
              <>
                <button className="px-[13px] py-2 bg-ink text-button-primary-text text-[12.5px] font-medium">
                  Resume automation from step {intervention.context.stepNumber}
                </button>
                <button className="px-[13px] py-2 border border-line bg-panel text-[12.5px] font-medium text-ink">
                  Mark completed manually
                </button>
                <button className="px-[13px] py-2 border border-red-line bg-button-destructive text-red-deep text-[12.5px] font-medium">
                  Abandon run
                </button>
              </>
            ) : (
              <>
                <span className="px-[13px] py-2 border border-line bg-panel text-[12.5px] text-ink-mute">
                  Resume automation from step {intervention.context.stepNumber}
                </span>
                <span className="px-[13px] py-2 border border-line bg-panel text-[12.5px] text-ink-mute">
                  Mark completed manually
                </span>
                <span className="px-[13px] py-2 border border-line bg-panel text-[12.5px] text-ink-mute">
                  Abandon run
                </span>
                <span className="text-xs text-ink-mute self-center">
                  — all disabled until control is claimed
                </span>
              </>
            )}
          </div>

          {operatorHolds && (
            <p className="text-xs leading-[1.55] text-ink-body">
              A hand-back that cannot re-establish its footing fails loudly rather than guessing.
              Whichever button you press, you are asked for a one-line reason, and it is written to
              the ledger beside your name.
            </p>
          )}
        </div>

        <div className="min-w-0 flex flex-col gap-3.5">
          <Panel label={operatorHolds ? 'Control ledger — live' : 'Control ledger'}>
            <div className="-mx-[15px] -my-3.5">
              {ledger.map((entry) => (
                <LedgerRow key={entry.entryId} entry={entry} />
              ))}
            </div>
          </Panel>

          {operatorHolds ? (
            <Panel label="Constraints while you hold control">
              <div className="flex flex-col gap-2">
                {session.constraints.map((constraint) => (
                  <div key={constraint.text} className="flex gap-2.5 items-start">
                    <span
                      className={`font-mono text-[10.5px] flex-none pt-px ${
                        constraint.decision === 'allow' ? 'text-green-deep' : 'text-red-deep'
                      }`}
                    >
                      {constraint.decision}
                    </span>
                    <span className="text-xs leading-[1.45] text-ink-body">{constraint.text}</span>
                  </div>
                ))}
              </div>
            </Panel>
          ) : (
            <Panel>
              <p className="text-xs leading-[1.55] text-ink-body">
                The token does not move on its own. A paused agent still holds it, which is why
                nothing in the left-hand column is actionable yet — there is never a moment where
                both parties could act.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}
