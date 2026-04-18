import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy } from 'lucide-react';
import type { MovieEntry, WatchMeta } from '@/types';
import { getImdbColor } from '@/lib/utils';

interface Props {
  open: boolean;
  entry: MovieEntry | null;
  meta?: WatchMeta | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  plan: 'Plan to Watch',
  watching: 'Watching',
  watched: 'Watched',
};
const STATUS_COLOR: Record<string, string> = {
  plan: 'var(--status-plan-text)',
  watching: 'var(--status-watching-text)',
  watched: 'var(--status-watched-text)',
};

export function DuplicateDialog({ open, entry, meta, onClose }: Props) {
  return createPortal(
    <AnimatePresence>
      {open && entry && (
        <>
          {/* Overlay — higher z than Radix Dialog's z-50 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            style={{ zIndex: 200 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-2xl border shadow-2xl p-6"
            style={{ zIndex: 201, background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
                <Copy className="h-6 w-6 text-amber-400" />
              </div>
            </div>

            {/* Heading */}
            <h3
              className="text-center text-lg font-bold mb-1"
              style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}
            >
              Already in Your Watchlist
            </h3>
            <p className="text-center text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
              This title was found as an existing entry.
            </p>

            {/* Entry card */}
            <div
              className="rounded-xl border p-4 mb-5 space-y-1.5"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
                  {entry.title}
                </span>
                {entry.year && (
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {entry.year}
                  </span>
                )}
              </div>

              {entry.genre && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{entry.genre}</p>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                <span
                  className="text-xs px-1.5 py-0.5 rounded border font-medium"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
                >
                  {entry.section}
                </span>

                {meta?.status && (
                  <span
                    className="text-xs font-semibold"
                    style={{ color: STATUS_COLOR[meta.status] }}
                  >
                    {STATUS_LABEL[meta.status]}
                  </span>
                )}

                {entry.imdbRating && entry.imdbRating !== 'N/A' && (
                  <span className={`text-xs font-bold font-mono ${getImdbColor(entry.imdbRating)}`}>
                    ★ {entry.imdbRating}
                  </span>
                )}
              </div>
            </div>

            {/* Action */}
            <button
              onClick={onClose}
              className="w-full h-10 rounded-lg text-sm font-semibold transition-colors bg-indigo-500 text-white hover:bg-indigo-600"
            >
              Got it!
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
