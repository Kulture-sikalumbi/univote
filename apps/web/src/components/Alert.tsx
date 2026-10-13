type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  success: 'bg-green-50 text-green-800 border-green-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  error: 'bg-red-50 text-red-800 border-red-200',
};

export function Alert({ variant = 'info', title, children }: AlertProps) {
  return (
    <div className={['rounded-md border p-3 text-sm', VARIANT_CLASSES[variant]].join(' ')}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}
