import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import type { MovieEntry, WatchMeta, WatchStatus } from '@/types';
import { MovieRow } from './MovieRow';
import { SECTION_COLORS, SECTION_EMOJIS } from '@/lib/utils';

interface Props {
  section: string;
  entries: MovieEntry[];
  meta: Record<string, WatchMeta>;
  onStatusChange: (id: string, status: WatchStatus) => void;
  onRatingChange: (id: string, rating: number | undefined) => void;
  onEdit: (entry: MovieEntry) => void;
  onDelete: (id: string) => void;
  onPosterLoaded: (id: string, url: string) => void;
  dragHandleProps?: Record<string, unknown>;
}

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export function WatchlistSection({
  section, entries, meta,
  onStatusChange, onRatingChange, onEdit, onDelete, onPosterLoaded,
  dragHandleProps,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const color = SECTION_COLORS[section] ?? '#818cf8';
  const emoji = SECTION_EMOJIS[section] ?? '🎬';

  return (
    <div className="mb-6">
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2 mb-1"
        style={{ borderLeft: `3px solid ${color}`, background: `${color}08` }}
      >
        <span
          {...dragHandleProps}
          className="cursor-grab text-[var(--text-disabled)] hover:text-[var(--text-muted)] transition-colors touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <span className="text-base">{emoji}</span>
        <h2
          className="flex-1 text-sm font-semibold tracking-wide"
          style={{ color, fontFamily: 'Syne, sans-serif' }}
        >
          {section}
        </h2>
        <span className="text-xs text-[var(--text-muted)] font-mono">{entries.length}</span>
        <button
          onClick={() => setCollapsed((p) => !p)}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <motion.div
              variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
              initial="hidden"
              animate="visible"
            >
              {entries.map((entry) => (
                <motion.div key={entry.id} variants={itemVariants} layout>
                  <MovieRow
                    entry={entry}
                    meta={meta[entry.id] ?? { id: entry.id, status: 'plan' }}
                    onStatusChange={(s) => onStatusChange(entry.id, s)}
                    onRatingChange={(r) => onRatingChange(entry.id, r)}
                    onEdit={() => onEdit(entry)}
                    onDelete={() => onDelete(entry.id)}
                    onPosterLoaded={(url) => onPosterLoaded(entry.id, url)}
                  />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
