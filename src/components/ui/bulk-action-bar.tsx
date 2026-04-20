import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Trash2, Eye, Clock, Bookmark, X } from 'lucide-react';
import type { WatchStatus } from '@/types';

interface Props {
  count: number;
  onStatusChange: (status: WatchStatus) => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionBar({ count, onStatusChange, onDelete, onClear }: Props) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl border shadow-2xl"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center gap-1.5 mr-2 text-xs font-semibold" style={{ color: 'var(--accent-purple)' }}>
            <CheckSquare className="h-3.5 w-3.5" />
            {count} selected
          </div>

          <div className="w-px h-5" style={{ background: 'var(--border-subtle)' }} />

          <button
            onClick={() => onStatusChange('plan')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--status-plan-text)' }}
            title="Mark as Plan to Watch"
          >
            <Bookmark className="h-3.5 w-3.5" />
            Plan
          </button>

          <button
            onClick={() => onStatusChange('watching')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--status-watching-text)' }}
            title="Mark as Watching"
          >
            <Clock className="h-3.5 w-3.5" />
            Watching
          </button>

          <button
            onClick={() => onStatusChange('watched')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--status-watched-text)' }}
            title="Mark as Watched"
          >
            <Eye className="h-3.5 w-3.5" />
            Watched
          </button>

          <div className="w-px h-5" style={{ background: 'var(--border-subtle)' }} />

          <button
            onClick={onDelete}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-red-500/10"
            style={{ color: 'var(--accent-red)' }}
            title="Delete selected"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>

          <button
            onClick={onClear}
            className="ml-1 rounded-lg p-1 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
            title="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
