import { HTMLAttributes } from 'react';

export type BadgeHue = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'violet';

const hueClasses: Record<BadgeHue, string> = {
  neutral: 'border-line bg-badge-neutral text-ink-body',
  blue: 'border-blue-line bg-blue-wash text-blue-ink',
  green: 'border-green-line bg-green-wash text-green-ink',
  amber: 'border-amber-line bg-amber-wash text-amber-ink',
  red: 'border-red-line bg-red-wash text-red-ink',
  violet: 'border-violet-line bg-violet-wash text-violet-ink',
};

export function Badge({
  hue = 'neutral',
  live = false,
  className,
  children,
  ...rest
}: {
  hue?: BadgeHue;
  live?: boolean;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] font-mono text-[10.5px] leading-none px-[7px] py-0.5 rounded-none border whitespace-nowrap ${hueClasses[hue]}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {live && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current shrink-0 animate-status-pulse" />
      )}
      {children}
    </span>
  );
}
