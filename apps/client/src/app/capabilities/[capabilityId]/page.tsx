import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { AppShell } from '@/components/app-shell';
import { ActionClassChip, type ActionClass } from '@/components/action-class-chip';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { LocatorLadderView } from '@/components/locator-ladder';
import { MicroBadge } from '@/components/micro-badge';
import { Panel } from '@/components/panel';
import { capabilities } from '@/fixtures';
import type { Assertion, Capability, Checkpoint, Step, WaitCondition } from '@/types';

async function approveCapability(formData: FormData) {
  'use server';
  const capabilityId = String(formData.get('capabilityId'));
  const capability = capabilities.find((one) => one.capabilityId === capabilityId);
  if (capability) capability.status = 'approved';
  revalidatePath(`/capabilities/${capabilityId}`);
}

// Mirrors the executor's own classifier so the console can never tell a
// reviewer something different from what the engine will actually do.
function actionClassOf(step: Step): 'navigate' | 'read' | 'mutate' {
  switch (step.action.actionType) {
    case 'navigate':
      return 'navigate';
    case 'click':
      return 'read';
    case 'fill':
      return 'mutate';
  }
}

function chipOf(step: Step): ActionClass {
  return step.action.actionType;
}

function describeWait(waitFor: WaitCondition) {
  switch (waitFor.waitUntil) {
    case 'pageLoad':
      return 'wait: page load';
    case 'selectorPresent':
      return `wait: selector ${waitFor.selector}`;
    case 'textPresent':
      return `wait: text "${waitFor.text}"`;
    case 'fixedDelay':
      return `wait: ${waitFor.milliseconds}ms`;
  }
}

function describeAssertion(assertion: Assertion) {
  switch (assertion.assert) {
    case 'text_present':
      return `text_present: "${assertion.text}"`;
    case 'text_absent':
      return `text_absent: "${assertion.text}"`;
    case 'url_matches':
      return `url_matches: ${assertion.pattern}`;
    case 'element_present':
      return 'element_present: (locator ladder)';
  }
}

function ContractTab({ capability }: { capability: Capability }) {
  const actionClasses = [...new Set(capability.steps.map(actionClassOf))];
  const mutatingSteps = capability.steps.filter((step) => actionClassOf(step) === 'mutate');

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-4 items-start">
        <Panel label="Inputs — supplied per call" meta={String(capability.inputs.length)}>
          <div className="flex flex-col gap-3">
            {capability.inputs.map((input) => (
              <div key={input.name} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <span className="font-mono text-[12.5px] font-semibold text-ink">{input.name}</span>
                  <span className="font-mono text-[11px] text-violet-ink">{input.valueType}</span>
                  {input.required && <MicroBadge hue="neutral">required</MicroBadge>}
                  {input.secret && <MicroBadge hue="red">secret</MicroBadge>}
                </div>
                {input.description && (
                  <div className="text-[12.5px] leading-[1.5] text-ink-body">{input.description}</div>
                )}
                {input.secret && (
                  <div className="font-mono text-[11px] leading-[1.6] text-ink-mute bg-panel-head border border-line-soft px-2.5 py-2">
                    stored as: {`{{${input.name}}}`}
                    <br />
                    value: &lt;never written to the artifact&gt;
                  </div>
                )}
              </div>
            ))}
            <div className="text-xs leading-[1.5] text-ink-mute border-t border-line-soft pt-2.5">
              A secret is held by reference. The step that consumes it carries the placeholder, so the
              artifact stays safe to read and the credential is supplied at replay time instead.
            </div>
          </div>
        </Panel>

        <Panel label="Outputs — returned to caller" meta={String(capability.outputs.length)}>
          <div className="-mx-[15px] -my-3.5">
            {capability.outputs.map((output) => (
              <div
                key={output.name}
                className="px-[15px] py-3 border-b border-line-soft last:border-b-0 flex flex-col gap-1"
              >
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <span className="font-mono text-[12.5px] font-semibold text-ink">{output.name}</span>
                  <span className="font-mono text-[11px] text-violet-ink">{output.valueType}</span>
                  {output.secret && <MicroBadge hue="blue">masked</MicroBadge>}
                  {!output.required && <MicroBadge hue="neutral">optional</MicroBadge>}
                </div>
                {output.description && (
                  <div className="text-xs leading-[1.45] text-ink-body">{output.description}</div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel label="Success condition — asserted, not assumed">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
          <div className="font-mono text-[11.5px] leading-[1.75] text-ink bg-panel-head border border-line-soft px-3 py-2.5 min-w-0">
            {capability.checkpoints.map((checkpoint) => (
              <div key={checkpoint.checkpointId}>
                <div className="text-ink-mute">after {checkpoint.afterStepId}:</div>
                <div>all_of:</div>
                {checkpoint.allOf.map((assertion, index) => (
                  <div key={index} className="pl-3 break-words">
                    - <span className="text-blue-ink">{describeAssertion(assertion)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="text-[12.5px] leading-[1.55] text-ink-body min-w-0">
            Several asserts rather than one, because each catches a different lie the app can tell.
            The text assert catches &ldquo;we navigated somewhere else entirely.&rdquo; The URL assert
            catches a frame that answered 200 with a login screen. The absent-text assert catches a
            rendered grid that came back empty — which is a business outcome, not a balance.
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4 items-start">
        <Panel label="Declared business outcomes">
          <div className="-mx-[15px] -my-3.5">
            {capability.businessOutcomes.map((rule) => (
              <div
                key={rule.code}
                className="px-[15px] py-2.5 border-b border-line-soft flex gap-2.5 items-baseline"
              >
                <span className="font-mono text-[11.5px] text-blue-ink flex-none">
                  {rule.code.toUpperCase()}
                </span>
                <span className="text-xs leading-[1.45] text-ink-body">
                  {rule.condition.when === 'checkpoint_failed'
                    ? `checkpoint ${rule.condition.checkpointId} did not hold`
                    : `step ${rule.condition.stepId} failed with ${rule.condition.failureCode}`}
                </span>
              </div>
            ))}
            <div className="px-[15px] py-3 text-xs leading-[1.5] text-ink-mute">
              Declaring these is what lets replay return them as answers instead of throwing. Anything
              not on this list and not a checkpoint pass is a failure.
            </div>
          </div>
        </Panel>

        <Panel label="Safety envelope">
          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between gap-3 items-baseline border-b border-line-soft pb-2.5">
              <span className="text-[12.5px] text-ink-body">Action classes used</span>
              <span className="font-mono text-[11px] text-ink text-right">
                {actionClasses.join(' · ')}
              </span>
            </div>
            <div className="flex justify-between gap-3 items-baseline border-b border-line-soft pb-2.5">
              <span className="text-[12.5px] text-ink-body">Mutating steps</span>
              <span
                className={`font-mono text-[11px] text-right ${mutatingSteps.length === 0 ? 'text-green-deep' : 'text-amber-deep'}`}
              >
                {mutatingSteps.length === 0
                  ? 'none — read-only'
                  : `${mutatingSteps.length} — ${mutatingSteps.map((step) => step.stepId).join(', ')}`}
              </span>
            </div>
            <div className="flex justify-between gap-3 items-baseline">
              <span className="text-[12.5px] text-ink-body">Unattended replay</span>
              <span
                className={`font-mono text-[11px] text-right ${capability.status === 'approved' ? 'text-green-deep' : 'text-amber-deep'}`}
              >
                {capability.status === 'approved' ? 'permitted' : 'blocked until approved'}
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function StepPanel({
  index,
  step,
  checkpoint,
}: {
  index: number;
  step: Step;
  checkpoint?: Checkpoint;
}) {
  const hasLadder = step.action.actionType !== 'navigate';

  return (
    <>
      <Panel>
        <div className="-mx-[15px] -my-3.5">
          <div className="flex gap-3 items-center px-[15px] py-[11px] border-b border-line-soft bg-panel-head">
            <span className="font-mono text-[11px] text-ink-mute">
              {String(index + 1).padStart(2, '0')}
            </span>
            <ActionClassChip actionClass={chipOf(step)} />
            <span className="text-[13px] font-medium text-ink">
              {step.description ?? step.stepId}
            </span>
            {step.waitFor && (
              <span className="ml-auto font-mono text-[10px] text-ink-mute">
                {describeWait(step.waitFor)}
              </span>
            )}
          </div>
          <div className="px-[15px] py-[13px] grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-[18px]">
            {step.action.actionType === 'navigate' ? (
              <div className="min-w-0 flex flex-col gap-2.5">
                <div className="type-section-label">Entry route</div>
                <div className="font-mono text-[11px] text-ink break-words">{step.action.url}</div>
              </div>
            ) : (
              <LocatorLadderView ladder={step.action.target} />
            )}
            <div className="min-w-0 flex flex-col gap-2.5">
              <div className="type-section-label">Notes</div>
              <div className="text-xs leading-[1.55] text-ink-body">
                {step.action.actionType === 'fill' && step.action.value.startsWith('{{')
                  ? `Value is written as the placeholder ${step.action.value}, never a literal, so the recorded run cannot leak the caller's data.`
                  : hasLadder
                    ? 'Resolution walks the ladder in order and records which rung matched, so a capability that starts landing lower is a drift signal before it breaks.'
                    : 'The entry route is the one constant in the flow; everything downstream is reached by acting on the surface rather than by URL.'}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {checkpoint && (
        <Panel>
          <div className="-mx-[15px] -my-3.5">
            <div className="flex gap-3 items-center px-[15px] py-[11px] border-b border-line-soft bg-panel-head">
              <span className="font-mono text-[11px] text-ink-mute">--</span>
              <ActionClassChip actionClass="assert" />
              <span className="text-[13px] font-medium text-ink">{checkpoint.checkpointId}</span>
              <span className="ml-auto font-mono text-[10px] text-ink-mute">
                all {checkpoint.allOf.length} must hold
              </span>
            </div>
            <div className="px-[15px] py-[13px] grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-[18px]">
              <div className="min-w-0 flex flex-col gap-2.5">
                <div className="type-section-label">Branch table</div>
                <div className="font-mono text-[11px] leading-[1.75] text-ink bg-panel-head border border-line-soft px-3 py-2.5">
                  {checkpoint.allOf.map((assertion, index) => (
                    <div key={index} className="break-words">
                      {describeAssertion(assertion)} <span className="text-ink-mute">→ continue</span>
                    </div>
                  ))}
                  <div className="text-blue-ink">otherwise → declared business outcome</div>
                </div>
              </div>
              <div className="min-w-0 flex flex-col gap-2.5">
                <div className="type-section-label">Notes</div>
                <div className="text-xs leading-[1.55] text-ink-body">
                  This is where the error taxonomy lives in the schema: a checkpoint declares what
                  must hold, so &ldquo;no such member&rdquo; becomes a typed return value rather than
                  an exception caught three layers up.
                </div>
              </div>
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}

function StepsTab({ capability }: { capability: Capability }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="px-[15px] py-[13px] border border-line bg-panel text-[12.5px] leading-[1.6] text-ink-body">
        <strong className="font-semibold text-ink">Locator policy.</strong> Each step carries a ranked
        list of ways to find its control, not one selector. Resolution walks the list and records
        which rung it landed on — so a capability that starts falling back to lower rungs is a drift
        signal long before it breaks. Server-generated ids are recorded but ranked last, because they
        change with a vendor patch.
      </div>

      {capability.steps.map((step, index) => (
        <StepPanel
          key={step.stepId}
          index={index}
          step={step}
          checkpoint={capability.checkpoints.find((one) => one.afterStepId === step.stepId)}
        />
      ))}

      {capability.extractions.length > 0 && (
        <Panel>
          <div className="-mx-[15px] -my-3.5">
            <div className="flex gap-3 items-center px-[15px] py-[11px] border-b border-line-soft bg-panel-head">
              <span className="font-mono text-[11px] text-ink-mute">--</span>
              <ActionClassChip actionClass="extract" />
              <span className="text-[13px] font-medium text-ink">Declared extractions</span>
              <span className="ml-auto font-mono text-[10px] text-ink-mute">
                {capability.extractions.length} outputs
              </span>
            </div>
            {capability.extractions.map((extraction) => (
              <div
                key={extraction.outputName}
                className="px-[15px] py-[13px] border-b border-line-soft last:border-b-0 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-[18px]"
              >
                <LocatorLadderView ladder={extraction.target} />
                <div className="min-w-0 flex flex-col gap-2.5">
                  <div className="type-section-label">Writes to</div>
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-mono text-[12px] font-semibold text-ink">
                      {extraction.outputName}
                    </span>
                    <span className="font-mono text-[11px] text-violet-ink">
                      {extraction.valueType}
                    </span>
                  </div>
                  <div className="text-[11px] leading-[1.45] text-ink-mute">
                    Coerced to {extraction.valueType} at the extractor boundary, so the caller never
                    parses a currency string.
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

export default async function ArtifactReviewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ capabilityId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { capabilityId } = await params;
  const { tab } = await searchParams;
  const capability = capabilities.find((one) => one.capabilityId === capabilityId);
  if (!capability) notFound();

  const activeTab = tab === 'steps' ? 'steps' : 'contract';
  const tabs = [
    { key: 'contract', name: 'Contract', href: `/capabilities/${capabilityId}` },
    { key: 'steps', name: 'Steps & locators', href: `/capabilities/${capabilityId}?tab=steps` },
    { key: 'versions', name: 'Versions & variants' },
    { key: 'raw', name: 'Raw artifact' },
  ];

  return (
    <AppShell active="capabilities">
      <header className="px-[26px] pt-4 bg-panel border-b border-line">
        <div className="flex items-center gap-[7px] font-mono text-[11px] text-ink-mute mb-[11px]">
          <Link href="/capabilities" className="text-blue-ink hover:underline">
            capabilities
          </Link>
          <span>/</span>
          <span>{capability.name}</span>
        </div>

        <div className="flex items-start gap-[22px]">
          <div className="flex-1 min-w-0 flex flex-col gap-[7px]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="type-machine-title">{capability.name}</h1>
              <Badge>v{capability.version}</Badge>
              <Badge hue={capability.status === 'approved' ? 'green' : 'neutral'}>
                {capability.status}
              </Badge>
            </div>
            <p className="text-[13px] leading-[1.5] text-ink-body max-w-[74ch]">{capability.goal}</p>
            <div className="flex gap-[18px] font-mono text-[11px] text-ink-mute flex-wrap">
              <span>{capability.steps.length} steps</span>
              <span>{capability.checkpoints.length} checkpoints</span>
              <span>{capability.extractions.length} extractions</span>
              {capability.provenance && (
                <span>
                  discovered by <span className="text-ink">{capability.provenance.discoveredByModel}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-none pb-0.5">
            <Button variant="secondary">Replay now</Button>
            <Button variant="secondary">Request changes</Button>
            {capability.status === 'approved' ? (
              <Button variant="approve" disabled>
                Approved
              </Button>
            ) : (
              <form action={approveCapability}>
                <input type="hidden" name="capabilityId" value={capability.capabilityId} />
                <Button variant="approve" type="submit">
                  Approve v{capability.version}
                </Button>
              </form>
            )}
          </div>
        </div>

        <div className="flex mt-[15px]">
          {tabs.map((one) => {
            const isActive = one.key === activeTab;
            const className = `px-[13px] py-[9px] text-[12.5px] border-b-2 ${
              isActive
                ? 'border-ink font-semibold text-ink'
                : one.href
                  ? 'border-transparent text-ink-mute hover:text-ink'
                  : 'border-transparent text-ink-mute opacity-50'
            }`;

            return one.href && !isActive ? (
              <Link key={one.key} href={one.href} className={className}>
                {one.name}
              </Link>
            ) : (
              <span key={one.key} className={className}>
                {one.name}
              </span>
            );
          })}
        </div>
      </header>

      <div className="flex-1 min-h-0 px-[26px] py-5">
        {activeTab === 'contract' ? (
          <ContractTab capability={capability} />
        ) : (
          <StepsTab capability={capability} />
        )}
      </div>
    </AppShell>
  );
}
