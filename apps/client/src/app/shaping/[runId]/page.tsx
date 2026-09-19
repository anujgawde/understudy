import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/button';
import { MicroBadge } from '@/components/micro-badge';
import { Panel } from '@/components/panel';
import { shapingSession } from '@/fixtures';
import type { ObservedValue } from '@/types';

function ConfidenceMeter({
  confidence,
  width,
  ground,
}: {
  confidence: number;
  width: string;
  ground: string;
}) {
  return (
    <div className="flex flex-col gap-1" style={{ width }}>
      <div className="font-mono text-[10px] text-ink-mute">{confidence.toFixed(2)}</div>
      <div className="h-[3px] bg-track">
        <div className={`h-[3px] ${ground}`} style={{ width: `${Math.round(confidence * 100)}%` }} />
      </div>
    </div>
  );
}

function AmbiguousItem({ value }: { value: ObservedValue }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="font-mono text-[12.5px] font-semibold text-ink break-words">
            {value.value}
          </div>
          <div className="text-xs leading-[1.5] text-ink-body">{value.source}</div>
        </div>
        <div className="flex-none flex flex-col gap-1 items-end">
          <div className="font-mono text-[10.5px] text-ink-body">
            confidence {value.confidence.toFixed(2)}
          </div>
          <div className="w-[92px] h-1 bg-track">
            <div
              className="h-1 bg-amber-ink"
              style={{ width: `${Math.round(value.confidence * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {value.uncertaintyReason && (
        <div className="text-xs leading-[1.55] text-ink-body bg-panel-head border border-line-soft px-[11px] py-2.5">
          <strong className="font-semibold text-ink">Why it&rsquo;s unsure:</strong>{' '}
          {value.uncertaintyReason}
        </div>
      )}

      <div className="flex gap-[7px] flex-wrap">
        {(value.alternatives ?? []).map((alternative) => (
          <button
            key={alternative}
            className={`px-[11px] py-1.5 font-mono text-[11px] border ${
              alternative === value.proposedRole
                ? 'border-ink bg-ink text-button-primary-text'
                : 'border-line bg-panel text-ink-body hover:bg-button-secondary-hover'
            }`}
          >
            {alternative === 'discard' ? 'discard' : `make ${alternative}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export default async function ShapingPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (runId !== shapingSession.runId) notFound();
  const session = shapingSession;

  const ambiguous = session.values.filter((one) => one.confidence < session.autoAcceptThreshold);
  const accepted = session.values.filter((one) => one.confidence >= session.autoAcceptThreshold);

  return (
    <AppShell active="shaping">
      <header className="px-[26px] pt-[17px] pb-[15px] bg-panel border-b border-line flex gap-5 items-end">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="type-section-label">S3 · from {session.runId}</div>
          <h1 className="type-page-heading">Shape the contract</h1>
          <p className="text-[13px] leading-[1.55] text-ink-mute max-w-[82ch]">
            The run touched {session.values.length} concrete values. The recorder proposed a role for
            each; anything it is at least{' '}
            <strong className="font-semibold text-ink">
              {session.autoAcceptThreshold.toFixed(2)}
            </strong>{' '}
            confident about is accepted automatically — you only arbitrate the rest.
          </p>
        </div>
        <div className="flex gap-2 flex-none">
          <Button variant="secondary">Discard run</Button>
          <Button variant="primary">Create v1 draft</Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 px-[26px] py-[18px] grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-[18px] items-start">
        <div className="min-w-0 flex flex-col gap-4">
          <div className="border border-amber-line bg-panel">
            <div className="flex items-center gap-3 px-[14px] py-2.5 border-b border-amber-line bg-amber-wash">
              <div className="font-mono text-[9.5px] tracking-[0.08em] uppercase font-semibold text-amber-deep">
                Needs your decision
              </div>
              <div className="ml-auto font-mono text-[10.5px] text-amber-deep">
                {ambiguous.length} below threshold
              </div>
            </div>
            <div className="p-[14px] flex flex-col gap-[11px]">
              {ambiguous.map((value) => (
                <AmbiguousItem key={value.valueId} value={value} />
              ))}
            </div>
          </div>

          <Panel
            label="Auto-accepted — disclosed, not hidden"
            meta={`${accepted.length} at or above threshold`}
          >
            <div className="-mx-[15px] -my-3.5">
              {accepted.map((value) => (
                <div
                  key={value.valueId}
                  className="px-[14px] py-3 border-b border-line-soft grid grid-cols-[minmax(0,1fr)_112px_88px] gap-3 items-center"
                >
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <div className="font-mono text-xs text-ink break-words">{value.value}</div>
                    <div className="text-[11px] text-ink-mute">{value.source}</div>
                  </div>
                  <div>
                    <MicroBadge hue="violet">{value.proposedRole}</MicroBadge>
                  </div>
                  <ConfidenceMeter
                    confidence={value.confidence}
                    width="88px"
                    ground="bg-green-ink"
                  />
                </div>
              ))}
              <div className="px-[14px] py-3 text-xs leading-[1.55] text-ink-body">
                Auto-accepted never means invisible — each row is one click to override, and the
                decision is written into the artifact&rsquo;s provenance.
              </div>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 flex flex-col gap-3.5">
          <Panel label="Contract preview">
            <pre className="font-mono text-[11px] leading-[1.75] text-ink overflow-hidden">
              {JSON.stringify(
                {
                  name: session.capabilityName,
                  version: 1,
                  inputs: Object.fromEntries(
                    session.values
                      .filter((one) => one.proposedRole === 'input')
                      .map((one) => [
                        one.contractName,
                        { type: one.contractType, required: true, redaction: 'member_identifier' },
                      ]),
                  ),
                  outputs: Object.fromEntries(
                    session.values
                      .filter((one) => one.proposedRole === 'output')
                      .map((one) => [one.contractName, one.contractType]),
                  ),
                  constants: Object.fromEntries(
                    session.values
                      .filter(
                        (one) =>
                          one.proposedRole === 'constant' &&
                          one.confidence >= session.autoAcceptThreshold,
                      )
                      .map((one) => [one.contractName, one.value.replace(/^"|"$/g, '')]),
                  ),
                  provenance: {
                    autoAccepted: accepted.length,
                    humanDecided: ambiguous.length,
                    threshold: session.autoAcceptThreshold,
                  },
                },
                null,
                2,
              )}
            </pre>
          </Panel>

          <Panel label="Auto-accept threshold">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-mono text-[21px] font-semibold text-ink">
                {session.autoAcceptThreshold.toFixed(2)}
              </span>
              <span className="text-[11.5px] text-ink-mute">{session.thresholdSource}</span>
            </div>
            <div className="h-[5px] bg-track mb-2.5">
              <div
                className="h-[5px] bg-ink"
                style={{ width: `${Math.round(session.autoAcceptThreshold * 100)}%` }}
              />
            </div>
            <p className="text-xs leading-[1.55] text-ink-body">
              Set per policy profile, not per run. A mature app can sit at 0.80 and shape itself
              unattended; a newly onboarded one sits at 0.99 so a human sees everything until the
              recorder earns trust.
            </p>
          </Panel>

          <Panel>
            <p className="text-xs leading-[1.55] text-ink-body">
              Confidence is a shaping-time signal only. It is deliberately absent from the capability
              schema — a replayed artifact must not depend on how sure the recorder once was.
            </p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
