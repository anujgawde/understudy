import { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'approve' | 'destructive';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-button-primary-text hover:bg-button-primary-hover',
  secondary: 'bg-panel text-ink border border-line hover:bg-button-secondary-hover',
  approve: 'bg-button-approve text-white hover:bg-button-approve-hover',
  destructive: 'bg-button-destructive text-red-ink border border-red-line hover:bg-button-destructive-hover',
};

export function Button({
  variant = 'secondary',
  className,
  ...rest
}: { variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`font-sans text-[13px] font-medium leading-none px-3.5 py-2 rounded-none cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${variantClasses[variant]}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  );
}
