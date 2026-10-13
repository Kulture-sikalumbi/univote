import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark focus-visible:outline-primary',
  secondary:
    'bg-white text-primary border border-primary hover:bg-primary/5 focus-visible:outline-primary',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
};

export function Button({
  variant = 'primary',
  fullWidth = false,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium',
        'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
