import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, AlertTriangle, FilePlus } from 'lucide-react';
import { Button } from './button';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, description,
  confirmLabel = 'Delete',
  variant = 'danger',
  onConfirm, onCancel,
}: Props) {
  const isDanger = variant === 'danger';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border shadow-2xl p-6"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex justify-center mb-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full border ${
                isDanger
                  ? 'bg-red-500/10 border-red-500/20'
                  : 'bg-amber-500/10 border-amber-500/20'
              }`}>
                {isDanger
                  ? <AlertTriangle className="h-6 w-6 text-red-400" />
                  : <AlertTriangle className="h-6 w-6 text-amber-400" />
                }
              </div>
            </div>

            <h3 className="text-center text-lg font-bold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>
              {title}
            </h3>
            {description && (
              <p className="text-center text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
                {description}
              </p>
            )}

            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
              <button
                onClick={onConfirm}
                className={`flex-1 inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white transition-colors ${
                  isDanger
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {isDanger
                  ? <Trash2 className="h-4 w-4" />
                  : <FilePlus className="h-4 w-4" />
                }
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
