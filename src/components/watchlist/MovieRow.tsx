import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Pencil, Trash2, ChevronDown, ChevronUp, Link, Clock } from 'lucide-react';
import type { MovieEntry, WatchMeta, WatchStatus } from '@/types';
import { StatusBadge } from './StatusBadge';
import { RatingBadge } from './RatingBadge';
import { PosterThumb } from './PosterThumb';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getImdbColor } from '@/lib/utils';

interface Props {
  entry: MovieEntry;
  meta: WatchMeta;
  onStatusChange: (status: WatchStatus) => void;
  onRatingChange: (rating: number | undefined) => void;
  onEdit: () => void;
  onDelete: () => void;
  onPosterLoaded: (url: string) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function MovieRow({ entry, meta, onStatusChange, onRatingChange, onEdit, onDelete, onPosterLoaded, selectMode, selected, onToggleSelect }: Props) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const ActionButtons = ({ className = '' }: { className?: string }) => (
    <div className={`flex items-center gap-2 ${className}`}>
      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-colors hover:border-indigo-500/40 hover:text-indigo-400"
        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
        title="Edit"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={() => setConfirmOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-colors hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400"
        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </motion.button>
    </div>
  );

  return (
    <>
      <div
        className="group rounded-xl border px-3 py-3 cursor-default"
        style={{
          borderColor: selected ? 'var(--accent-purple)' : 'transparent',
          background: selected ? 'color-mix(in srgb, var(--accent-purple) 6%, transparent)' : 'transparent',
          transition: 'border-color 180ms ease, background 180ms ease',
        }}
        onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
        onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = 'transparent'; }}
        onClick={selectMode ? onToggleSelect : undefined}
      >
        <div className="rounded-lg transition-colors duration-200 group-hover:bg-[var(--bg-hover)] -mx-1 px-1 py-0.5">
          <div className="flex items-start gap-3">
            {/* Selection checkbox */}
            {selectMode && (
              <div className="flex-shrink-0 mt-1 flex items-center">
                <div
                  className="h-4 w-4 rounded border-2 flex items-center justify-center transition-colors"
                  style={{
                    borderColor: selected ? 'var(--accent-purple)' : 'var(--text-muted)',
                    background: selected ? 'var(--accent-purple)' : 'transparent',
                  }}
                >
                  {selected && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 10 8"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
              </div>
            )}
            <PosterThumb
              title={entry.title}
              year={entry.year}
              type={entry.type}
              posterUrl={entry.posterUrl}
              onPosterLoaded={onPosterLoaded}
            />

            <div className="min-w-0 flex-1">
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-base leading-tight" style={{ color: 'var(--text-primary)' }}>
                      {entry.title}
                    </span>
                    {entry.year && (
                      <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                        ({entry.year})
                      </span>
                    )}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-md font-medium border"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
                    >
                      {entry.type}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {[entry.country, entry.genre].filter(Boolean).join(' · ')}
                  </div>
                </div>

                {/* Desktop: hover-only edit/delete in title row */}
                <ActionButtons className="hidden sm:flex flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
              </div>

              {/* Badges row */}
              <div className="mt-2.5 flex items-start gap-3 flex-wrap">
                <StatusBadge status={meta.status} onChange={onStatusChange} />

                {/* Duration — highlighted pill */}
                {meta.duration && (
                  <span
                    className="inline-flex items-center gap-1 self-center rounded-md px-2 py-0.5 text-xs font-semibold border"
                    style={{
                      color: 'var(--accent-cyan)',
                      borderColor: 'color-mix(in srgb, var(--accent-cyan) 35%, transparent)',
                      background: 'color-mix(in srgb, var(--accent-cyan) 8%, transparent)',
                    }}
                  >
                    <Clock className="h-3 w-3" />
                    {meta.duration}
                  </span>
                )}

                {entry.imdbRating && entry.imdbRating !== 'N/A' && (
                  <div className="flex flex-col items-center gap-0.5">
                    <a
                      href={entry.imdbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-0.5 text-sm font-bold font-mono ${getImdbColor(entry.imdbRating)} hover:underline`}
                    >
                      ★ {entry.imdbRating} <ExternalLink className="h-3 w-3 opacity-50" />
                    </a>
                    <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-disabled)' }}>
                      IMDb
                    </span>
                  </div>
                )}

                <div className="flex flex-col items-center gap-0.5">
                  <RatingBadge rating={meta.personalRating} onChange={onRatingChange} />
                  <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-disabled)' }}>
                    My Rating
                  </span>
                </div>

                {meta.watchPlatform && (
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-md border self-center"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
                  >
                    {meta.watchPlatform}
                  </span>
                )}

                {meta.watchedOn && (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                      {meta.watchedOn}
                    </span>
                    <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--text-disabled)' }}>
                      Watched On
                    </span>
                  </div>
                )}

                {meta.watchLink && (
                  <a
                    href={meta.watchLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 self-center rounded-lg px-2 py-1 text-xs font-semibold border transition-all hover:opacity-80"
                    style={{
                      color: 'var(--accent-cyan)',
                      borderColor: 'var(--accent-cyan)',
                      background: 'color-mix(in srgb, var(--accent-cyan) 8%, transparent)',
                    }}
                    title="Private Watch Link"
                  >
                    <Link className="h-3 w-3" /> Watch
                  </a>
                )}

                {meta.notes && (
                  <button
                    onClick={() => setNotesOpen((p) => !p)}
                    className="inline-flex items-center gap-0.5 text-xs font-semibold self-center transition-colors"
                    style={{ color: 'var(--accent-purple)' }}
                  >
                    Notes {notesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>

              {/* Mobile: always-visible edit/delete below badges */}
              <div className="mt-2.5 sm:hidden">
                <ActionButtons />
              </div>

              <AnimatePresence>
                {notesOpen && meta.notes && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 overflow-hidden"
                  >
                    <p
                      className="text-sm leading-relaxed rounded-xl px-3 py-2.5 border"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
                    >
                      {meta.notes}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete "${entry.title}"?`}
        description="This will permanently remove this entry from your watchlist. This action cannot be undone."
        confirmLabel="Delete Entry"
        onConfirm={() => { setConfirmOpen(false); onDelete(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
