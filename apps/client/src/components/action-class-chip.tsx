import { HTMLAttributes } from 'react';

export type ActionClass = 'navigate' | 'fill' | 'click' | 'assert' | 'extract' | 'submit';

const actionClasses: Record<ActionClass, string> = {
  navigate: 'bg-chip-navigate text-chip-navigate-text',
  fill: 'bg-chip-fill text-chip-fill-text',
  click: 'bg-chip-click text-chip-click-text',
  assert: 'bg-chip-assert text-chip-assert-text',
  extract: 'bg-chip-extract text-chip-extract-text',
  submit: 'bg-chip-submit text-chip-submit-text',
};

export function ActionClassChip({
  actionClass,
  className,
  ...rest
}: {
  actionClass: ActionClass;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-block font-mono text-[11.5px] font-semibold leading-none px-1.75 py-0.5 border-none rounded-none whitespace-nowrap ${actionClasses[actionClass]}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {actionClass}
    </span>
  );
}
