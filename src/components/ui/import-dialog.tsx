import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, GitMerge, Replace } from 'lucide-react';
import type { WatchlistState } from '@/types';
import type { ImportMode } from '@/hooks/useWatchlist';

interface Props {
  pending: WatchlistState | null;
  currentCount: number;
  onChoose: (mode: ImportMode) => void;
  onCancel: () => void;
}

/** Lets the user merge an import into their list (skipping duplicates) or replace the list outright. */
export function ImportDialog({ pending, currentCount, onChoose, onCancel }: Props) {
  return createPortal(
    <AnimatePresence>
      {pending && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm" style={{ zIndex: 200 }}
            onClick={onCancel}
          />
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="import-title"
            initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.18 }}
            className="fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6 shadow-2xl"
            style={{ zIndex: 201, background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-indigo-500/20 bg-indigo-500/10">
                <Upload className="h-6 w-6 text-indigo-400" />
              </div>
            </div>
            <h3 id="import-title" className="mb-1 text-center text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Import {pending.entries.length} titles
            </h3>
            <p className="mb-5 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              You currently have {currentCount} titles. How should the file be applied?
            </p>
            <div className="grid gap-2">
              <button
                onClick={() => onChoose('merge')}
                className="flex items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
                style={{ borderColor: 'var(--accent-purple)' }}
              >
                <GitMerge className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: 'var(--accent-purple)' }} />
                <span>
                  <span className="block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Merge (recommended)</span>
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Add new titles, skip ones already in your list.</span>
                </span>
              </button>
              <button
                onClick={() => onChoose('replace')}
                className="flex items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-red-500/10"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <Replace className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                <span>
                  <span className="block text-sm font-semibold text-red-400">Replace everything</span>
                  <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Your current list is discarded. Export first if unsure.</span>
                </span>
              </button>
              <button onClick={onCancel} className="mt-1 h-10 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-secondary)' }}>
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
