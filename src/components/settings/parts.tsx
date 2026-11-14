import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Building blocks shared by the Settings tabs.

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {description && <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-muted)' }}>{description}</span>}
      </span>
      <span className="relative h-5 w-9 flex-shrink-0 rounded-full transition-colors" style={{ background: checked ? 'var(--accent)' : 'var(--bg-hover)' }}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}

const cardStyle = { background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' } as const;

export function Card({ title, description, children, danger }: { title?: string; description?: ReactNode; children?: ReactNode; danger?: boolean }) {
  return (
    <section className="mb-4 rounded-2xl border p-2 sm:p-3" style={danger ? { ...cardStyle, borderColor: 'rgb(239 68 68 / 0.3)' } : cardStyle}>
      {(title || description) && (
        <header className="px-3 pb-1 pt-2">
          {title && <h2 className="text-sm font-bold" style={{ color: danger ? '#f87171' : 'var(--text-primary)' }}>{title}</h2>}
          {description && <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

