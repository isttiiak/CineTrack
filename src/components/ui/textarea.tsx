import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, style, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-lg border px-3 py-2 text-sm font-medium',
        'focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]/50 focus:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50 resize-none transition-colors',
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
Textarea.displayName = 'Textarea';

export { Textarea };
