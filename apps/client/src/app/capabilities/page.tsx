import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/badge';
import { MicroBadge } from '@/components/micro-badge';
import { StabilityBar } from '@/components/stability-bar';
import { capabilities, runs } from '@/fixtures';
import type { Capability } from '@/types';

const gridColumns = 'grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.7fr)_74px_96px_92px] gap-4';

// The signature is the row's identity — a caller scans for shape, not prose.
function signatureOf(capability: Capability) {
  const inputNames = capability.inputs.map((input) => input.name).join(', ');
  const outputNames = capability.outputs.map((output) => output.name).join(', ');
  return `(${inputNames}) → { ${outputNames} }`;
}

// A declared business outcome is the app answering correctly, so it counts as a
// pass — only a `failed` run is the automation's own fault.
function stabilityOf(capabilityId: string) {
  const forCapability = runs.filter((run) => run.capabilityId === capabilityId);
  return {
    passed: forCapability.filter((run) => run.outcome?.classification !== 'failed').length,
    total: forCapability.length,
  };
}

function CatalogRow({ capability }: { capability: Capability }) {
  const stability = stabilityOf(capability.capabilityId);

  return (
    <div className={`${gridColumns} items-center px-[15px] py-[13px] bg-panel border-b border-line-soft`}>
      <div className="min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-[7px] flex-wrap">
          <span className="font-mono text-[12.5px] font-medium text-ink">{capability.name}</span>
          {capability.irreversible && <MicroBadge hue="red">irreversible</MicroBadge>}
          {capability.tenantOverride && <MicroBadge hue="violet">tenant override</MicroBadge>}
        </div>
        <div className="text-xs text-ink-mute">{capability.goal}</div>
      </div>

      <div className="font-mono text-[11px] leading-[1.5] text-ink-body min-w-0">
        {signatureOf(capability)}
      </div>

      <div className="font-mono text-[11.5px] text-ink-body">v{capability.version}</div>

      <StabilityBar passed={stability.passed} total={stability.total} />

      <div>
        <Badge hue={capability.status === 'approved' ? 'green' : 'neutral'}>
          {capability.status}
        </Badge>
      </div>
    </div>
  );
}

export default function CapabilitiesPage() {
  const approvedCount = capabilities.filter((one) => one.status === 'approved').length;
  const draftCount = capabilities.length - approvedCount;

  return (
    <AppShell active="capabilities">
      <header className="px-[26px] pt-5 pb-[17px] bg-panel border-b border-line flex items-end gap-5">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="type-section-label">S5</div>
          <h1 className="type-page-heading">Capabilities</h1>
          <p className="text-[13px] text-ink-mute">
            Everything an AI agent can invoke by name. Only{' '}
            <span className="font-mono text-xs">approved</span> capabilities are callable unattended.
          </p>
        </div>
        <div className="flex gap-2 flex-none">
          <button className="px-[13px] py-2 border border-line bg-panel text-[12.5px] font-medium text-ink">
            Export manifest
          </button>
          <button className="px-[13px] py-2 bg-ink text-button-primary-text text-[12.5px] font-medium">
            New discovery run
          </button>
        </div>
      </header>

      <div className="px-[26px] py-[11px] border-b border-line flex gap-[7px] items-center">
        <div className="px-2.5 py-[5px] border border-line bg-panel font-mono text-[11px] flex gap-1.5">
          <span className="text-ink-mute">app</span>
          <span className="text-ink">meridian-core</span>
          <span className="text-rail-label">▾</span>
        </div>
        <div className="px-2.5 py-[5px] border border-line bg-panel font-mono text-[11px] flex gap-1.5">
          <span className="text-ink-mute">tenant</span>
          <span className="text-ink">riverbend-cu</span>
          <span className="text-rail-label">▾</span>
        </div>
        <div className="w-px h-[18px] bg-line mx-[3px]" />
        <div className="px-2.5 py-[5px] border border-ink bg-ink text-button-primary-text font-mono text-[11px]">
          all · {capabilities.length}
        </div>
        <div className="px-2.5 py-[5px] border border-line bg-panel font-mono text-[11px] text-ink-body">
          approved · {approvedCount}
        </div>
        <div className="px-2.5 py-[5px] border border-line bg-panel font-mono text-[11px] text-ink-body">
          draft · {draftCount}
        </div>
      </div>

      <div className="px-[26px] flex-1 min-h-0 flex flex-col">
        <div className={`${gridColumns} px-[15px] py-[11px] border-b border-line type-section-label`}>
          <div>Capability</div>
          <div>Signature</div>
          <div>Version</div>
          <div>Stability</div>
          <div>State</div>
        </div>

        {capabilities.map((capability) => (
          <CatalogRow key={capability.capabilityId} capability={capability} />
        ))}

        <div className="mt-[22px] px-[17px] py-[15px] border border-dashed border-line bg-panel-head flex gap-[15px] items-start">
          <div className="type-section-label flex-none pt-0.5">Agent view</div>
          <div className="flex-1 min-w-0 text-[12.5px] leading-[1.55] text-ink-body">
            The same list is served to calling agents as a tool manifest at{' '}
            <span className="font-mono text-xs bg-chip-click px-[5px] py-px">
              GET /capabilities?status=approved
            </span>{' '}
            — one source, two audiences, so a reviewer can never approve something the agent sees
            differently.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
