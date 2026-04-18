import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Pencil, Trash2, ChevronDown, ChevronUp, Link } from 'lucide-react';
import type { MovieEntry, WatchMeta, WatchStatus } from '@/types';
import { StatusBadge } from './StatusBadge';
import { RatingBadge } from './RatingBadge';
import { PosterThumb } from './PosterThumb';
import { getImdbColor } from '@/lib/utils';

interface Props {
  entry: MovieEntry;
  meta: WatchMeta;
  onStatusChange: (status: WatchStatus) => void;
  onRatingChange: (rating: number | undefined) => void;
  onEdit: () => void;
  onDelete: () => void;
  onPosterLoaded: (url: string) => void;
}

export function MovieRow({ entry, meta, onStatusChange, onRatingChange, onEdit, onDelete, onPosterLoaded }: Props) {
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <motion.div
      layout
      className="group rounded-xl border border-transparent hover:border-[var(--border-subtle)] hover:bg-white/[0.025] transition-all duration-150 px-3 py-2.5"
    >
      <div className="flex items-center gap-3">
        <PosterThumb
          title={entry.title}
          year={entry.year}
          type={entry.type}
          posterUrl={entry.posterUrl}
          onPosterLoaded={onPosterLoaded}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-[var(--text-primary)] text-sm leading-tight">{entry.title}</span>
                {entry.year && <span className="text-xs text-[var(--text-muted)]">({entry.year})</span>}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                  {entry.type}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-[var(--text-muted)] truncate">
                {[entry.country, entry.genre].filter(Boolean).join(' · ')}
              </div>
            </div>

            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              {meta.watchLink && (
                <a
                  href={meta.watchLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 text-[var(--text-muted)] hover:text-indigo-400 transition-colors"
                  title="Watch Link"
                >
                  <Link className="h-3.5 w-3.5" />
                </a>
              )}
              <button onClick={onEdit} className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={onDelete} className="rounded p-1 text-[var(--text-muted)] hover:text-red-400 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={meta.status} onChange={onStatusChange} />
            <RatingBadge rating={meta.personalRating} onChange={onRatingChange} />

            {entry.imdbRating && entry.imdbRating !== 'N/A' && (
              <a
                href={entry.imdbUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-0.5 text-xs font-mono ${getImdbColor(entry.imdbRating)} hover:underline`}
              >
                {entry.imdbRating} <ExternalLink className="h-2.5 w-2.5 opacity-60" />
              </a>
            )}

            {meta.watchPlatform && (
              <span className="text-xs text-[var(--text-muted)]">{meta.watchPlatform}</span>
            )}

            {meta.watchedOn && (
              <span className="text-xs text-[var(--text-disabled)]">{meta.watchedOn}</span>
            )}

            {meta.notes && (
              <button
                onClick={() => setNotesOpen((p) => !p)}
                className="inline-flex items-center gap-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Notes {notesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
          </div>

          <AnimatePresence>
            {notesOpen && meta.notes && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 overflow-hidden"
              >
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-elevated)] rounded-lg px-3 py-2 border border-[var(--border-subtle)]">
                  {meta.notes}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
