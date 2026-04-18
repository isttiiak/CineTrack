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
      className="group rounded-xl border border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-all duration-150 px-3 py-3"
    >
      <div className="flex items-start gap-3">
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
                <span className="font-semibold text-[var(--text-primary)] text-base leading-tight">{entry.title}</span>
                {entry.year && (
                  <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                    ({entry.year})
                  </span>
                )}
                <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {entry.type}
                </span>
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {[entry.country, entry.genre].filter(Boolean).join(' · ')}
              </div>
            </div>

            {/* Action buttons — always visible on mobile, hover on desktop */}
            <div className="flex items-center gap-1 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              {meta.watchLink && (
                <a
                  href={meta.watchLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-elevated)]"
                  style={{ color: 'var(--text-muted)' }}
                  title="Watch Link"
                >
                  <Link className="h-4 w-4" />
                </a>
              )}
              <button
                onClick={onEdit}
                className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-elevated)]"
                style={{ color: 'var(--text-muted)' }}
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={onDelete}
                className="rounded-lg p-1.5 transition-colors hover:bg-red-500/10"
                style={{ color: 'var(--text-muted)' }}
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
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
                className={`inline-flex items-center gap-0.5 text-sm font-mono font-medium ${getImdbColor(entry.imdbRating)} hover:underline`}
              >
                ★ {entry.imdbRating} <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            )}

            {meta.watchPlatform && (
              <span className="text-sm font-medium px-2 py-0.5 rounded-md"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                {meta.watchPlatform}
              </span>
            )}

            {meta.watchedOn && (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{meta.watchedOn}</span>
            )}

            {meta.notes && (
              <button
                onClick={() => setNotesOpen((p) => !p)}
                className="inline-flex items-center gap-0.5 text-sm font-medium transition-colors"
                style={{ color: 'var(--accent-purple)' }}
              >
                Notes {notesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
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
                <p className="text-sm leading-relaxed rounded-xl px-3 py-2.5 border"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
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
