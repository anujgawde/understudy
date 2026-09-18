// The only chart in the system. Fill colour is banded rather than continuous so
// a glance separates "healthy" from "watch this" without reading the fraction.
function bandGround(passRate: number) {
  if (passRate >= 0.95) return 'bg-green-ink';
  if (passRate >= 0.7) return 'bg-amber-ink';
  return 'bg-red-ink';
}

export function StabilityBar({ passed, total }: { passed: number; total: number }) {
  if (total === 0) {
    return (
      <div className="flex flex-col gap-1">
        <div className="font-mono text-[11px] text-ink-mute">—</div>
        <div className="h-[3px] bg-track" />
      </div>
    );
  }

  const passRate = passed / total;

  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-[11px] text-ink-body">
        {passed}/{total}
      </div>
      <div className="h-[3px] bg-track">
        <div
          className={`h-[3px] ${bandGround(passRate)}`}
          style={{ width: `${Math.round(passRate * 100)}%` }}
        />
      </div>
    </div>
  );
}
