import { HTMLAttributes } from 'react';

export type MicroBadgeHue = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'violet';

const hueClasses: Record<MicroBadgeHue, string> = {
  neutral: 'bg-ink text-button-primary-text',
  blue: 'bg-blue-wash text-blue-ink border border-blue-line',
  green: 'bg-green-wash text-green-ink border border-green-line',
  amber: 'bg-amber-wash text-amber-ink border border-amber-line',
  red: 'bg-red-wash text-red-ink border border-red-line',
  violet: 'bg-violet-wash text-violet-ink border border-violet-line',
};

export function MicroBadge({
  hue = 'neutral',
  className,
  children,
  ...rest
}: {
  hue?: MicroBadgeHue;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-block font-mono text-[9.5px] leading-none tracking-[0.04em] uppercase px-[5px] py-px rounded-none whitespace-nowrap ${hueClasses[hue]}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </span>
  );
}
