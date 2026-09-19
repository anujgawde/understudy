import type { Actor } from '@/types';

// The loudest element in the system, and the only one that inverts. The pulse
// distinguishes a ticking state from a held one: automation is waiting on a
// person, an operator is already acting.
export function ControlBanner({
  heldBy,
  operatorName,
  action,
}: {
  heldBy: Actor;
  operatorName: string;
  action: React.ReactNode;
}) {
  const operatorHolds = heldBy === 'operator';

  return (
    <div
      className={`flex items-center gap-[15px] px-[26px] py-[13px] ${
        operatorHolds
          ? 'bg-operator-control-ground text-operator-control-text'
          : 'bg-agent-control-ground text-agent-control-text'
      }`}
    >
      <span
        className={`w-[9px] h-[9px] flex-none ${
          operatorHolds ? 'bg-operator-dot' : 'bg-agent-dot animate-status-pulse'
        }`}
      />
      <span className="font-mono text-[11.5px] tracking-[0.06em] uppercase font-semibold flex-none">
        {operatorHolds ? `Control: you · ${operatorName}` : 'Control: automation'}
      </span>
      <span className="text-[12.5px] min-w-0 opacity-90">
        {operatorHolds
          ? 'Every click is recorded as human-authored and attributed to you. The agent is read-only until you hand back.'
          : 'Session is paused awaiting you. The agent still holds the control token and will not act while paused.'}
      </span>
      <span className="ml-auto flex-none">{action}</span>
    </div>
  );
}
