import { HTMLAttributes, ReactNode } from 'react';

export function Panel({
  label,
  meta,
  footnote,
  className,
  children,
  ...rest
}: {
  label?: string;
  meta?: ReactNode;
  footnote?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`border border-line bg-panel${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {label && (
        <div className="flex items-center justify-between px-[15px] py-[10px] bg-panel-head border-b border-line">
          <span className="type-section-label">{label}</span>
          {meta && <span className="font-mono text-[10px] leading-none text-ink-mute">{meta}</span>}
        </div>
      )}
      <div className="px-[15px] py-3.5">{children}</div>
      {footnote && (
        <div className="px-[15px] py-2.5 border-t border-line-soft font-sans text-xs leading-relaxed text-ink-mute">
          {footnote}
        </div>
      )}
    </div>
  );
}
