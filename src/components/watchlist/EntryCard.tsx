import { motion } from 'framer-motion';
import { Check, Clock, StickyNote } from 'lucide-react';
import type { MovieEntry, WatchMeta, WatchStatus } from '@/types';
import { StatusBadge } from './StatusBadge';
import { PosterThumb } from './PosterThumb';
import { getImdbColor, ratingSourceOf, cn, SECTION_COLORS, SECTION_EMOJIS } from '@/lib/utils';
import { HighlightText } from '@/components/ui/highlight-text';
import type { ParsedQuery } from '@/lib/search';

export interface EntryItemProps {
  entry: MovieEntry;
  meta: WatchMeta;
  selectMode: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onStatusChange: (status: WatchStatus) => void;
  onPosterLoaded: (url: string) => void;
  showSection: boolean;     // small section tag (hidden when the list is grouped by section)
  showDetails: boolean;     // runtime + notes indicators
  highlight?: ParsedQuery | null;   // search words to mark in the title
}

export function SectionTag({ section, className }: { section: string; className?: string }) {
  const color = SECTION_COLORS[section] ?? 'var(--accent-purple)';
  return (
    <span
      className={cn('inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-px text-[10px] font-medium', className)}
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
      title={`Section: ${section}`}
    >
      <span aria-hidden>{SECTION_EMOJIS[section] ?? '🎬'}</span>
      <span className="truncate">{section}</span>
    </span>
  );
}

export function SelectCheck({ selected }: { selected: boolean }) {
  return (
    <div
      className="flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors"
      style={{
        borderColor: selected ? 'var(--accent-purple)' : 'var(--text-muted)',
        background: selected ? 'var(--accent-purple)' : 'color-mix(in srgb, var(--bg-base) 60%, transparent)',
      }}
    >
      {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
    </div>
  );
}

/** Poster-first card for the grid view. Click opens the detail drawer (or toggles selection). */
export function EntryCard({ entry, meta, selectMode, selected, onOpen, onToggleSelect, onStatusChange, onPosterLoaded, showSection, showDetails, highlight }: EntryItemProps) {
  const hasImdb = entry.imdbRating && entry.imdbRating !== 'N/A';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      role="button"
      tabIndex={0}
      aria-pressed={selectMode ? selected : undefined}
      onClick={selectMode ? onToggleSelect : onOpen}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); (selectMode ? onToggleSelect : onOpen)(); } }}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
      )}
      style={{
        background: 'var(--bg-surface)',
        borderColor: selected ? 'var(--accent-purple)' : 'var(--border-subtle)',
        boxShadow: selected ? '0 0 0 1px var(--accent-purple)' : undefined,
      }}
    >
      <div className="relative">
        <PosterThumb
          title={entry.title} year={entry.year} type={entry.type} tmdbId={entry.tmdbId}
          posterUrl={entry.posterUrl} onPosterLoaded={onPosterLoaded}
          size="w342"
          className="aspect-[2/3] w-full rounded-none transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
        {selectMode && <div className="absolute left-2 top-2"><SelectCheck selected={selected} /></div>}
        {hasImdb && (
          <span
            className={cn('absolute right-2 top-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] font-bold', getImdbColor(entry.imdbRating))}
            title={`${ratingSourceOf(entry) === 'tmdb' ? 'TMDB' : 'IMDb'} rating`}
          >
            ★ {entry.imdbRating}
          </span>
        )}
        <div className="absolute bottom-2 left-2">
          <StatusBadge status={meta.status} onChange={onStatusChange} disabled={selectMode} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <p className="line-clamp-2 text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
          <HighlightText text={entry.title} query={highlight ?? null} />
        </p>
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span>{[entry.year, entry.type].filter(Boolean).join(' · ')}</span>
          {meta.personalRating != null && (
            <span className="ml-auto font-mono font-semibold" style={{ color: 'var(--accent-cyan)' }}>{meta.personalRating}/10</span>
          )}
        </div>
        {showSection && <SectionTag section={entry.section} className="mt-1 self-start" />}
        {showDetails && (meta.duration || meta.notes || meta.progressEpisode != null) && (
          <div className="mt-0.5 flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-disabled)' }}>
            {meta.duration && <span className="inline-flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{meta.duration}</span>}
            {meta.notes && <span className="inline-flex items-center gap-0.5"><StickyNote className="h-2.5 w-2.5" />Notes</span>}
            {meta.progressSeason != null && meta.progressEpisode != null && (
              <span className="font-mono font-semibold" style={{ color: 'var(--status-watching-text)' }}>S{meta.progressSeason}·E{meta.progressEpisode}</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
