import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Panel } from '@/components/panel';
import { policyProfile } from '@/fixtures';
import type { PolicyProfile } from '@/types';

const decisionHues: Record<PolicyProfile['rules'][number]['decision'], string> = {
  safe: 'border-green-line bg-green-wash text-green-deep',
  confirm: 'border-amber-line bg-amber-wash text-amber-deep',
  blocked: 'border-red-line bg-red-wash text-red-deep',
};

function KeyValue({
  label,
  value,
  divided = true,
}: {
  label: string;
  value: React.ReactNode;
  divided?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 items-baseline ${divided ? 'border-t border-line-soft pt-2.5' : ''}`}
    >
      <span className="text-[12.5px] text-ink-body">{label}</span>
      <span className="font-mono text-[11px] text-ink text-right">{value}</span>
    </div>
  );
}

export default function PolicyProfilePage() {
  const policy = policyProfile;

  return (
    <AppShell active="policy">
      <header className="px-[26px] pt-[18px] pb-[15px] bg-panel border-b border-line flex gap-5 items-end">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="type-section-label">S11</div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[19px] font-semibold text-ink">{policy.policyId}</h1>
            <Badge>rev {policy.revision}</Badge>
          </div>
          <p className="text-[13px] leading-[1.55] text-ink-mute max-w-[86ch]">
            {policy.description}
          </p>
        </div>
        <div className="flex gap-2 flex-none">
          <Button variant="secondary">View diff vs rev {policy.revision - 1}</Button>
          <Button variant="secondary">Export as YAML</Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 px-[26px] py-[18px] grid grid-cols-2 gap-4 content-start">
        <Panel label="Surface allowlist">
          <div className="flex flex-col gap-2.5">
            <div className="font-mono text-[11px] leading-[1.9]">
              {policy.allowedOrigins.map((origin) => (
                <div key={origin} className="flex gap-2.5">
                  <span className="text-green-deep flex-none">allow</span>
                  <span className="min-w-0 break-words text-ink">{origin}</span>
                </div>
              ))}
              {policy.deniedRoutes.map((route) => (
                <div key={route} className="flex gap-2.5">
                  <span className="text-red-deep flex-none">deny</span>
                  <span className="min-w-0 break-words text-ink">{route}</span>
                </div>
              ))}
            </div>
            <p className="text-xs leading-[1.5] text-ink-body border-t border-line-soft pt-[11px]">
              Enforced at the browser proxy. A navigation outside the list is refused before the
              request leaves, and the attempt is logged as a policy event rather than a network
              error. The <span className="font-mono text-[11.5px]">{'{tenant}'}</span> placeholder is
              what lets one profile cover hundreds of institutions.
            </p>
          </div>
        </Panel>

        <Panel label="Action classes" meta="safe · confirm · blocked">
          <div className="-mx-[15px] -my-3.5">
            {policy.rules.map((rule) => (
              <div
                key={rule.actionClass}
                className="grid grid-cols-[minmax(0,1fr)_124px] gap-3 items-center px-[14px] py-2.5 border-b border-line-soft last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="text-xs text-ink">{rule.actionClass}</div>
                  <div className="text-[11px] leading-[1.4] text-ink-mute">{rule.note}</div>
                </div>
                <div>
                  <span
                    className={`font-mono text-[10.5px] px-[7px] py-0.5 border ${decisionHues[rule.decision]}`}
                  >
                    {rule.decision}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel label="Data handling">
          <div className="flex flex-col gap-[11px]">
            <div className="flex flex-col gap-1">
              <span className="text-[12.5px] font-medium text-ink">Redaction classes</span>
              <span className="font-mono text-[11px] leading-[1.6] text-ink-body">
                {policy.redactedFieldNames.join(' · ')}
              </span>
            </div>
            <div className="flex flex-col gap-1 border-t border-line-soft pt-2.5">
              <span className="text-[12.5px] font-medium text-ink">Screenshot policy</span>
              <span className="text-xs leading-[1.5] text-ink-body">{policy.screenshotPolicy}</span>
            </div>
            <div className="flex flex-col gap-1 border-t border-line-soft pt-2.5">
              <span className="text-[12.5px] font-medium text-ink">Artifact scrubbing</span>
              <span className="text-xs leading-[1.5] text-ink-body">{policy.artifactScrubbing}</span>
            </div>
            <KeyValue label="Evidence retention" value={policy.evidenceRetention} />
          </div>
        </Panel>

        <Panel label="Escalation & autonomy">
          <div className="flex flex-col gap-[11px]">
            <KeyValue
              label="Risky action handling"
              value={policy.riskyActionHandling}
              divided={false}
            />
            <KeyValue label="Auto-accept threshold" value={policy.autoAcceptThreshold.toFixed(2)} />
            <KeyValue label="Max steps per run" value={policy.maxStepsPerRun} />
            <KeyValue
              label="Escalate on"
              value={policy.escalateOn.map((failure) => (
                <div key={failure}>{failure}</div>
              ))}
            />
            <KeyValue label="Intervention SLA" value={policy.interventionSla} />
            <p className="text-xs leading-[1.5] text-ink-body border-t border-line-soft pt-2.5">
              The SLA is bounded by the app&rsquo;s own session lifetime. There is no point holding a
              session open for a human who isn&rsquo;t coming — abandoning cleanly beats timing out
              ambiguously.
            </p>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
