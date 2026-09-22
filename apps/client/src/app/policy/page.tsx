import { AppShell } from '@/components/app-shell';
import { Panel } from '@/components/panel';
import { getPolicyProfile } from '@/lib/data';
import type { PolicyProfile } from '@/types';

const decisionHues: Record<PolicyProfile['rules'][number]['decision'], string> = {
  allow: 'border-green-line bg-green-wash text-green-deep',
  confirm: 'border-amber-line bg-amber-wash text-amber-deep',
  deny: 'border-red-line bg-red-wash text-red-deep',
};

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 items-baseline border-t border-line-soft pt-2.5">
      <span className="text-[12.5px] text-ink-body">{label}</span>
      <span className="font-mono text-[11px] text-ink text-right">{value}</span>
    </div>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <div className="text-xs leading-[1.5] text-ink-mute">{empty}</div>;
  }
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div key={item} className="font-mono text-[11px] text-ink-body break-all">
          {item}
        </div>
      ))}
    </div>
  );
}

export default async function PolicyProfilePage() {
  const policy = await getPolicyProfile();

  return (
    <AppShell active="policy">
      <header className="px-[26px] pt-[18px] pb-[15px] bg-panel border-b border-line flex gap-5 items-end">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="type-section-label">S11</div>
          <h1 className="type-page-heading">Policy</h1>
          <p className="text-[13px] text-ink-mute">
            The envelope a run executed inside. Enforced in the executor, not in the prompt — a
            model that ignores its instructions still cannot act outside it.
          </p>
        </div>
      </header>

      {policy === null ? (
        <div className="flex-1 min-h-0 px-[26px] py-[18px]">
          <div className="px-[17px] py-[15px] border border-dashed border-line bg-panel-head">
            <div className="type-section-label mb-1.5">No policy recorded yet</div>
            <div className="text-xs leading-[1.55] text-ink-body">
              A policy is written beside each run rather than kept in one place, so this screen
              shows what was actually enforced rather than what a config file claims. Run{' '}
              <span className="font-mono">npm run verify</span> or a discovery to produce one.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-[26px] py-[18px] grid grid-cols-[minmax(0,1fr)_360px] gap-4 items-start overflow-auto">
          <div className="flex flex-col gap-4 min-w-0">
            <Panel title="Action classes">
              <div className="p-[15px] flex flex-col gap-2">
                {policy.rules.map((rule) => (
                  <div
                    key={rule.actionClass}
                    className="flex items-center justify-between gap-3 px-3 py-2 border border-line bg-panel-head"
                  >
                    <span className="font-mono text-[11.5px] text-ink">{rule.actionClass}</span>
                    <span
                      className={`px-2 py-px border font-mono text-[10.5px] uppercase tracking-[0.04em] ${decisionHues[rule.decision]}`}
                    >
                      {rule.decision}
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-[15px] py-[11px] bg-panel-head border-t border-line-soft text-xs leading-[1.5] text-ink-body">
                A click counts as a mutation when the control it targets is named in the
                irreversible list — &ldquo;Post Transaction&rdquo; and &ldquo;Back to
                Search&rdquo; are the same DOM event and only one of them needs asking about.
              </div>
            </Panel>

            <Panel title="Where a run may go">
              <div className="p-[15px] flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <div className="type-micro-label">Allowed origins</div>
                  <List items={policy.allowedOrigins} empty="none" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="type-micro-label">Allowed routes</div>
                  <List
                    items={policy.allowedPathPrefixes}
                    empty="the whole origin — narrow this per tenant to reach one screen rather than one application"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="type-micro-label">Controls treated as irreversible</div>
                  <List items={policy.irreversibleControlLabels} empty="none" />
                </div>
              </div>
            </Panel>

            <Panel title="What never reaches disk">
              <div className="p-[15px] flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <div className="type-micro-label">Redacted field names</div>
                  <List items={policy.redactedFieldNames} empty="none" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="type-micro-label">Redacted patterns</div>
                  <List items={policy.redactedPatterns} empty="none" />
                </div>
              </div>
              <div className="px-[15px] py-[11px] bg-panel-head border-t border-line-soft text-xs leading-[1.5] text-ink-body">
                Applied at the write boundary, and again on the page before a screenshot is
                captured — a frame carries the same values as pixels, where a text filter cannot
                reach them.
              </div>
            </Panel>
          </div>

          <div className="flex flex-col gap-4 min-w-0">
            <Panel title="In force for">
              <div className="p-[15px] flex flex-col gap-2.5">
                <div className="font-mono text-[11px] text-ink-body break-all">
                  {policy.evidencePath}
                </div>
                <KeyValue label="Policy id" value={policy.policyId} />
                <KeyValue label="Name" value={policy.name} />
                <KeyValue label="Step budget" value={policy.maxStepsPerRun} />
                <KeyValue label="Time budget" value={`${policy.maxRunSeconds}s`} />
              </div>
            </Panel>

            <Panel title="What escalates to a person">
              <div className="p-[15px] flex flex-col gap-1">
                {policy.escalateOn.map((code) => (
                  <div key={code} className="font-mono text-[11px] text-ink-body">
                    {code}
                  </div>
                ))}
              </div>
              <div className="px-[15px] py-[11px] bg-panel-head border-t border-line-soft text-xs leading-[1.5] text-ink-body">
                The test is whether a person at the keyboard could do something about it.{' '}
                <span className="font-mono">locator_not_found</span> is absent on purpose: a ladder
                that matches nothing is an artifact to re-record, not a job for an operator.{' '}
                <span className="font-mono">app_error</span> is absent because nobody can repair a
                500 from inside the session.
              </div>
            </Panel>
          </div>
        </div>
      )}
    </AppShell>
  );
}
