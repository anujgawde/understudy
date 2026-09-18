import Link from 'next/link';
import type { ReactNode } from 'react';

const navGroups = [
  {
    label: 'Author',
    items: [
      { key: 'capabilities', name: 'Capabilities', href: '/capabilities', tally: '4' },
      { key: 'discovery', name: 'Discovery runs' },
      { key: 'shaping', name: 'Shaping queue', badge: { count: 1, hue: 'blue' as const } },
    ],
  },
  {
    label: 'Operate',
    items: [
      { key: 'replays', name: 'Replay history', href: '/replays' },
      { key: 'interventions', name: 'Interventions', badge: { count: 2, hue: 'amber' as const } },
    ],
  },
  {
    label: 'Govern',
    items: [{ key: 'policy', name: 'Policy profiles' }],
  },
];

const badgeGrounds = {
  blue: 'bg-blue-ink',
  amber: 'bg-amber-ink',
};

function NavItem({
  item,
  active,
}: {
  item: { key: string; name: string; href?: string; tally?: string; badge?: { count: number; hue: 'blue' | 'amber' } };
  active: boolean;
}) {
  const body = (
    <>
      <span>{item.name}</span>
      {item.tally && <span className="font-mono text-[10px] opacity-60">{item.tally}</span>}
      {item.badge && (
        <span
          className={`font-mono text-[9.5px] leading-none px-[5px] py-px text-white ${badgeGrounds[item.badge.hue]}`}
        >
          {item.badge.count}
        </span>
      )}
    </>
  );

  const className = `flex items-center justify-between gap-2 px-[9px] py-[7px] text-[13px] ${
    active
      ? 'bg-ink text-button-primary-text font-semibold'
      : 'text-ink-body hover:bg-rail-hover'
  }`;

  return item.href ? (
    <Link href={item.href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={`${className} opacity-70`}>{body}</div>
  );
}

export function AppShell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <nav className="w-[200px] flex-none bg-rail border-r border-line flex flex-col">
        <div className="p-[17px] border-b border-line flex flex-col gap-[3px]">
          <div className="flex items-center gap-2">
            <div className="w-[11px] h-[11px] bg-ink" />
            <div className="text-[14.5px] font-semibold -tracking-[0.01em] text-ink">Understudy</div>
          </div>
          <div className="font-mono text-[9.5px] tracking-[0.04em] text-ink-mute pl-[19px]">
            automation control plane
          </div>
        </div>

        <div className="px-[9px] py-[11px] flex flex-col gap-0.5">
          {navGroups.map((group) => (
            <div key={group.label} className="contents">
              <div className="font-mono text-[9px] tracking-[0.09em] uppercase text-rail-label px-2 pt-4 pb-[7px] first:pt-[5px]">
                {group.label}
              </div>
              {group.items.map((item) => (
                <NavItem key={item.key} item={item} active={item.key === active} />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-auto border-t border-line px-[15px] py-[13px] flex flex-col gap-[9px]">
          <div className="font-mono text-[9px] tracking-[0.09em] uppercase text-rail-label">
            Acting as
          </div>
          <div className="flex border border-line bg-panel">
            <div className="flex-1 text-center py-[5px] text-[11px] bg-ink text-button-primary-text font-semibold">
              Engineer
            </div>
            <div className="flex-1 text-center py-[5px] text-[11px] border-l border-line text-ink-body">
              Operator
            </div>
          </div>
        </div>
      </nav>

      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
