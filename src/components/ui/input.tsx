import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, style, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-lg border px-3 py-2 text-sm font-medium',
        'focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]/50 focus:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
        className
      )}
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-primary)',
        ...style,
      }}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
