import { motion } from 'framer-motion';
import { ChevronRight, Clock, StickyNote } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { PosterThumb } from './PosterThumb';
import { SelectCheck, type EntryItemProps } from './EntryCard';
import { getImdbColor, cn } from '@/lib/utils';

/** Compact single-line row for the list view. Details live in the drawer, not in the row. */
export function EntryRow({ entry, meta, selectMode, selected, onOpen, onToggleSelect, onStatusChange, onPosterLoaded }: EntryItemProps) {
  const hasImdb = entry.imdbRating && entry.imdbRating !== 'N/A';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      role="button"
      tabIndex={0}
      aria-pressed={selectMode ? selected : undefined}
      onClick={selectMode ? onToggleSelect : onOpen}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); (selectMode ? onToggleSelect : onOpen)(); } }}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-xl border px-2.5 py-2 transition-colors',
        'hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
      )}
      style={{
        borderColor: selected ? 'var(--accent-purple)' : 'transparent',
        background: selected ? 'color-mix(in srgb, var(--accent-purple) 8%, transparent)' : undefined,
      }}
    >
      {selectMode && <SelectCheck selected={selected} />}
      <PosterThumb
        title={entry.title} year={entry.year} type={entry.type}
        posterUrl={entry.posterUrl} onPosterLoaded={onPosterLoaded}
        size="w92" className="h-[60px] w-[40px]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{entry.title}</span>
          {entry.year && <span className="flex-shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>{entry.year}</span>}
        </div>
        <div className="flex items-center gap-2 truncate text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="truncate">{[entry.type, entry.genre].filter(Boolean).join(' · ')}</span>
          {meta.duration && <span className="hidden flex-shrink-0 items-center gap-0.5 sm:inline-flex"><Clock className="h-3 w-3" />{meta.duration}</span>}
          {meta.notes && <StickyNote className="h-3 w-3 flex-shrink-0" aria-label="Has notes" />}
        </div>
      </div>
      <div className="hidden w-14 flex-shrink-0 text-right sm:block">
        {hasImdb && <span className={cn('font-mono text-xs font-bold', getImdbColor(entry.imdbRating))}>★ {entry.imdbRating}</span>}
      </div>
      <div className="hidden w-12 flex-shrink-0 text-right sm:block">
        {meta.personalRating != null && (
          <span className="font-mono text-xs font-semibold" style={{ color: 'var(--accent-cyan)' }}>{meta.personalRating}/10</span>
        )}
      </div>
      <div className="flex-shrink-0">
        <StatusBadge status={meta.status} onChange={onStatusChange} disabled={selectMode} />
      </div>
      {!selectMode && <ChevronRight className="h-4 w-4 flex-shrink-0 opacity-30 transition-opacity group-hover:opacity-70" />}
    </motion.div>
  );
}
