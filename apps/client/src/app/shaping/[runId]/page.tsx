import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/badge';
import { Panel } from '@/components/panel';
import { getShaping } from '@/lib/data';
import type { ShapedOutcome, ShapedValue } from '@/types';

function ValueRow({ value, role }: { value: ShapedValue; role: 'input' | 'output' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2 border border-line bg-panel-head">
      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11.5px] text-ink">{value.name}</span>
          {value.secret && <Badge hue="amber">secret</Badge>}
        </div>
        {value.description && (
          <div className="text-[11.5px] text-ink-mute truncate">{value.description}</div>
        )}
      </div>
      <span className="font-mono text-[10.5px] text-ink-mute flex-none">
        {value.valueType} · {role}
      </span>
    </div>
  );
}

function OutcomeRow({ outcome }: { outcome: ShapedOutcome }) {
  return (
    <div className="px-3 py-2.5 border border-line bg-panel-head flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11.5px] text-ink">{outcome.code}</span>
      </div>
      <div className="text-[12.5px] text-ink-body">{outcome.message}</div>
      <div className="flex flex-col gap-0.5 font-mono text-[10.5px] text-ink-mute">
        <span>when · {outcome.condition}</span>
        <span>and · {outcome.signal}</span>
      </div>
    </div>
  );
}

export default async function ShapingPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const shaping = await getShaping(runId);
  if (!shaping) notFound();

  return (
    <AppShell active="shaping">
      <header className="px-[26px] pt-[18px] pb-[15px] bg-panel border-b border-line flex gap-5 items-end">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="type-section-label">S6</div>
          <h1 className="type-page-heading">{shaping.capabilityName}</h1>
          <p className="text-[13px] text-ink-mute">
            What one discovery run became. Values the run was handed are parameters by definition;
            what a model guessed at is the business outcomes, which is the part worth reviewing.
          </p>
        </div>
        <div className="flex gap-2 flex-none items-center">
          <Badge hue={shaping.status === 'approved' ? 'green' : 'neutral'}>{shaping.status}</Badge>
          <Link
            href={`/capabilities/${shaping.capabilityId}`}
            className="px-3.5 py-[9px] border border-line bg-panel text-[12.5px] text-ink-body"
          >
            Open artifact
          </Link>
        </div>
      </header>

      <div className="flex-1 min-h-0 px-[26px] py-[18px] grid grid-cols-[minmax(0,1fr)_380px] gap-4 items-start overflow-auto">
        <div className="flex flex-col gap-4 min-w-0">
          <Panel title="The contract it exposes">
            <div className="p-[15px] flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <div className="type-micro-label">Inputs the caller supplies</div>
                {shaping.inputs.length > 0 ? (
                  shaping.inputs.map((value) => (
                    <ValueRow key={value.name} value={value} role="input" />
                  ))
                ) : (
                  <div className="text-xs text-ink-mute">none — the flow takes no parameters</div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="type-micro-label">Outputs it returns</div>
                {shaping.outputs.length > 0 ? (
                  shaping.outputs.map((value) => (
                    <ValueRow key={value.name} value={value} role="output" />
                  ))
                ) : (
                  <div className="text-xs text-ink-mute">none — the flow reads nothing back</div>
                )}
              </div>
            </div>
            <div className="px-[15px] py-[11px] bg-panel-head border-t border-line-soft text-xs leading-[1.5] text-ink-body">
              A value traceable to what the run was handed, or to the goal it was given, becomes a
              parameter. A value the model supplied from nowhere else is a constant of the flow.
              The fallback that reads the goal text is the weak half — a value the model normalises
              on its way into the field gets baked in as a constant, quietly.
            </div>
          </Panel>

          <Panel title="Business outcomes the model proposed">
            <div className="p-[15px] flex flex-col gap-2">
              {shaping.businessOutcomes.length > 0 ? (
                shaping.businessOutcomes.map((outcome) => (
                  <OutcomeRow key={outcome.code} outcome={outcome} />
                ))
              ) : (
                <div className="text-xs leading-[1.5] text-ink-mute">
                  None. Reporting no business outcomes is a valid answer — some flows have no
                  legitimate negative result.
                </div>
              )}
            </div>
            <div className="px-[15px] py-[11px] bg-panel-head border-t border-line-soft text-xs leading-[1.5] text-ink-body">
              This is the one part a model guessed, and it only ever saw the flow succeed. Each rule
              has to carry a signal the page positively shows, so a wrong guess costs a business
              outcome that falls through to a plain failure — visible, and fixable here — rather
              than every failure being reported as whichever rule came first.
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <Panel title="Checkpoints derived from the run">
            <div className="p-[15px] flex flex-col gap-2">
              {shaping.checkpoints.length > 0 ? (
                shaping.checkpoints.map((checkpoint) => (
                  <div
                    key={checkpoint.checkpointId}
                    className="px-3 py-2 border border-line bg-panel-head flex flex-col gap-1"
                  >
                    <span className="font-mono text-[11.5px] text-ink">
                      {checkpoint.checkpointId}
                    </span>
                    <span className="font-mono text-[10.5px] text-ink-mute">
                      after · {checkpoint.afterStepId}
                    </span>
                    {checkpoint.asserts.map((assertion) => (
                      <span key={assertion} className="text-[11.5px] text-ink-body">
                        {assertion}
                      </span>
                    ))}
                  </div>
                ))
              ) : (
                <div className="text-xs text-ink-mute">none derived</div>
              )}
            </div>
          </Panel>

          <Panel title="Provenance">
            <div className="p-[15px] flex flex-col gap-2 font-mono text-[11px] text-ink-body break-all">
              <span>discovery run · {shaping.runId}</span>
              <span>{shaping.evidencePath}</span>
            </div>
            <div className="px-[15px] py-[11px] bg-panel-head border-t border-line-soft text-xs leading-[1.5] text-ink-body">
              A capability stays a draft until a replay of it succeeds and returns the values
              discovery read. Until then the unattended path refuses to run it.
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
