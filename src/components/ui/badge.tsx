import * as React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        variant === 'default' && 'bg-indigo-500/10 text-indigo-400',
        variant === 'success' && 'bg-emerald-500/10 text-emerald-400',
        variant === 'warning' && 'bg-yellow-500/10 text-yellow-400',
        variant === 'destructive' && 'bg-red-500/10 text-red-400',
        className
      )}
      {...props}
    />
  );
}

export { Badge };
