import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { ActionClassChip } from '@/components/action-class-chip';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Panel } from '@/components/panel';
import { discoveryRun } from '@/fixtures';
import type { DiscoveryStep } from '@/types';

const traceRows = ['observe', 'decide', 'act', 'policy'] as const;

function TraceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[58px_1fr] gap-2.5">
      <div className="font-mono text-[9px] tracking-[0.07em] uppercase text-rail-label pt-0.5">
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function StepCard({ step }: { step: DiscoveryStep }) {
  return (
    <div className={`border bg-panel ${step.inFlight ? 'border-blue-line' : 'border-line'}`}>
      <div
        className={`flex gap-2.5 items-center px-[13px] py-[9px] border-b ${
          step.inFlight ? 'border-blue-line bg-blue-wash' : 'border-line-soft bg-panel-head'
        }`}
      >
        <span
          className={`font-mono text-[10.5px] ${step.inFlight ? 'text-blue-deep' : 'text-ink-mute'}`}
        >
          step {step.sequence}
        </span>
        <ActionClassChip actionClass={step.actionClass} />
        {step.inFlight ? (
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-blue-deep">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-ink animate-status-pulse" />
            in flight
          </span>
        ) : (
          <span className="ml-auto font-mono text-[10px] text-ink-mute">
            {step.tokens?.toLocaleString()} tok · {((step.durationMs ?? 0) / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      <div className="px-[13px] py-3 flex flex-col gap-2.5">
        {traceRows.map((row) => {
          if (row === 'observe') {
            return (
              <TraceRow key={row} label="observe">
                <p className="text-xs leading-[1.5] text-ink-body">{step.observe}</p>
              </TraceRow>
            );
          }
          if (row === 'decide') {
            return (
              <TraceRow key={row} label="decide">
                <p className="text-xs leading-[1.5] text-ink">{step.decide}</p>
              </TraceRow>
            );
          }
          if (row === 'act') {
            return (
              <TraceRow key={row} label="act">
                <p className="font-mono text-[11px] leading-[1.5] text-ink-body break-words">
                  {step.act}
                </p>
              </TraceRow>
            );
          }
          return step.policy ? (
            <TraceRow key={row} label="policy">
              <p
                className={`font-mono text-[10.5px] leading-[1.5] ${
                  step.policy.decision === 'allow' ? 'text-green-deep' : 'text-amber-deep'
                }`}
              >
                {step.policy.decision} — {step.policy.reason}
              </p>
            </TraceRow>
          ) : null;
        })}
      </div>
    </div>
  );
}

export default async function DiscoveryTracePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  if (runId !== discoveryRun.runId) notFound();
  const run = discoveryRun;

  return (
    <AppShell active="discovery">
      <header className="px-[26px] pt-[17px] pb-[15px] bg-panel border-b border-line flex gap-5 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[11px] text-ink-mute">{run.runId}</span>
            <Badge hue="blue" live={run.state === 'running'}>
              {run.state}
            </Badge>
          </div>
          <h1 className="text-[18px] font-semibold -tracking-[0.015em] leading-[1.3] text-ink">
            &ldquo;{run.goal}&rdquo;
          </h1>
          <div className="flex gap-4 font-mono text-[11px] text-ink-mute flex-wrap">
            <span>
              target <span className="text-ink">{run.target} @ {run.tenant}</span>
            </span>
            <span>
              policy <span className="text-ink">{run.policyId}</span>
            </span>
            <span>
              perception <span className="text-ink">{run.perception}</span>
            </span>
          </div>
        </div>

        <div className="flex-none flex gap-2.5 items-stretch">
          <div className="border border-line px-3 py-2 bg-panel-head flex flex-col gap-0.5 min-w-[80px]">
            <div className="type-micro-label">Steps</div>
            <div className="font-mono text-sm font-semibold text-ink">
              {run.stepsTaken} / {run.maxSteps}
            </div>
          </div>
          <div className="border border-line px-3 py-2 bg-panel-head flex flex-col gap-0.5 min-w-[80px]">
            <div className="type-micro-label">Tokens</div>
            <div className="font-mono text-sm font-semibold text-ink">
              {(run.tokensUsed / 1000).toFixed(1)}k
            </div>
          </div>
          <Button variant="destructive">Stop run</Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 px-[26px] py-[18px] grid grid-cols-[minmax(0,1.32fr)_minmax(0,1fr)] gap-[18px] items-start">
        <div className="min-w-0 flex flex-col gap-2.5">
          {run.steps.map((step) => (
            <StepCard key={step.sequence} step={step} />
          ))}
        </div>

        <div className="min-w-0 flex flex-col gap-3">
          <Panel label="Current surface" meta={`step ${run.stepsTaken}`}>
            <div className="-mx-[15px] -my-3.5">
              <div className="h-[250px] flex items-center justify-center p-4 bg-[repeating-linear-gradient(135deg,var(--color-chip-click)_0_8px,var(--color-button-secondary-hover)_8px_16px)]">
                <span className="font-mono text-[10.5px] leading-[1.6] text-ink-body bg-panel px-2.5 py-[7px] border border-line text-center">
                  screenshot at step {run.stepsTaken}
                  <br />+ a11y tree diff
                </span>
              </div>
            </div>
          </Panel>

          <Panel label="Stop conditions">
            <div className="flex flex-col gap-2">
              {run.stopConditions.map((condition) => (
                <div key={condition.name} className="flex justify-between font-mono text-[11px]">
                  <span className="text-ink-mute">{condition.name}</span>
                  <span className={condition.escalates ? 'text-amber-deep' : 'text-ink'}>
                    {condition.value}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <p className="text-xs leading-[1.55] text-ink-body">
              The <span className="font-mono text-[11.5px]">decide</span> line is stored verbatim in
              the run log but never in the artifact. Reasoning explains a recording; it must not
              become a dependency of replay.
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
