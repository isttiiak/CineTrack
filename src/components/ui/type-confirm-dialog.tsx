import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Download, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Button } from './button';

interface Props {
  open: boolean;
  title: string;
  /** What gets deleted, as a short list. */
  items: ReactNode[];
  /** The word the user must type to enable the button. */
  phrase?: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onBackup?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * For irreversible actions (delete everything, delete the account): lists what will be lost,
 * offers a backup download and only enables the button once the user has typed the phrase.
 */
export function TypeConfirmDialog({ open, title, items, phrase = 'DELETE', confirmLabel, busy, error, onBackup, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (open) setTyped(''); }, [open]);
  const ready = typed.trim().toUpperCase() === phrase && !busy;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <form onSubmit={(e) => { e.preventDefault(); if (ready) onConfirm(); }} className="p-6">
          <div className="mb-3 flex items-center gap-3 pr-8">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </span>
            <DialogTitle className="text-lg leading-tight">{title}</DialogTitle>
          </div>

          <p className="mb-2 text-sm" style={{ color: 'var(--text-secondary)' }}>This permanently deletes:</p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {items.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
          <p className="mb-3 text-xs font-semibold text-red-400">This cannot be undone.</p>

          {onBackup && (
            <button
              type="button"
              onClick={onBackup}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <Download className="h-4 w-4" /> Download a backup first
            </button>
          )}

          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }} htmlFor="type-confirm-input">
            Type <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{phrase}</span> to confirm
          </label>
          <input
            id="type-confirm-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off" autoCapitalize="characters" spellCheck={false}
            disabled={busy}
            className="h-10 w-full rounded-lg border bg-transparent px-3 font-mono text-sm outline-none focus:border-red-400"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          />

          {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}

          <div className="mt-5 flex gap-3">
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
            <button
              type="submit"
              disabled={!ready}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
