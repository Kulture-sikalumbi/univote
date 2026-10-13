import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function TextField({ label, hint, id, className = '', name, ...rest }: TextFieldProps) {
  const inputId = id ?? name ?? label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        className={[
          'w-full rounded-md border border-gray-300 px-3 py-2 text-sm',
          'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
          className,
        ].join(' ')}
        {...rest}
      />
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}
