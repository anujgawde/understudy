import type { TimelineStep } from '@/types';

const dotGrounds: Record<TimelineStep['state'], string> = {
  passed: 'bg-green-ink',
  degraded: 'bg-amber-ink',
  failed: 'bg-red-ink',
  not_reached: 'border border-dot-unreached',
};

const detailInks: Record<TimelineStep['state'], string> = {
  passed: 'text-ink-mute',
  degraded: 'text-amber-deep',
  failed: 'text-red-deep',
  not_reached: 'text-ink-mute',
};

function formatDuration(milliseconds?: number) {
  if (milliseconds === undefined) return '—';
  return `${milliseconds.toLocaleString()}ms`;
}

export function StepTimeline({ steps, footnote }: { steps: TimelineStep[]; footnote: string }) {
  return (
    <div>
      {steps.map((step) => (
        <div
          key={step.stepId}
          className={`grid grid-cols-[18px_1fr_auto] gap-[11px] items-start px-[14px] py-[10px] border-b border-line-soft ${
            step.state === 'failed' ? 'bg-red-wash' : ''
          } ${step.state === 'not_reached' ? 'opacity-45' : ''}`}
        >
          <div className={`w-[9px] h-[9px] mt-[5px] ${dotGrounds[step.state]}`} />
          <div className="min-w-0">
            <div
              className={`text-[12.5px] text-ink ${step.state === 'failed' ? 'font-semibold' : 'font-medium'}`}
            >
              {step.title}
            </div>
            <div className={`font-mono text-[10.5px] leading-[1.5] ${detailInks[step.state]}`}>
              {step.resolvedByIndex !== undefined && `rung ${step.resolvedByIndex + 1} · `}
              {step.detail}
            </div>
          </div>
          <div
            className={`font-mono text-[10.5px] pt-0.5 ${step.state === 'failed' ? 'text-red-deep' : 'text-ink-mute'}`}
          >
            {formatDuration(step.durationMs)}
          </div>
        </div>
      ))}
      <div className="px-[14px] py-[11px] text-xs leading-[1.5] text-ink-mute">{footnote}</div>
    </div>
  );
}
