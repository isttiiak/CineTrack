import { createPortal } from 'react-dom';
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

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            style={{ zIndex: 200 }}
            onClick={onCancel}
          />

          {/* Mobile: slide up from bottom as a sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed bottom-0 left-0 right-0 sm:hidden rounded-t-2xl border-t border-x p-6 pb-8"
            style={{
              background: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              zIndex: 201,
              paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
            }}
          >
            <DialogContent
              isDanger={isDanger}
              title={title}
              description={description}
              confirmLabel={confirmLabel}
              onConfirm={onConfirm}
              onCancel={onCancel}
            />
          </motion.div>

          {/* Desktop: centered modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="hidden sm:block fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-2xl border shadow-2xl p-6"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', zIndex: 201 }}
          >
            <DialogContent
              isDanger={isDanger}
              title={title}
              description={description}
              confirmLabel={confirmLabel}
              onConfirm={onConfirm}
              onCancel={onCancel}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function DialogContent({ isDanger, title, description, confirmLabel, onConfirm, onCancel }: {
  isDanger: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="flex justify-center mb-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full border ${
          isDanger ? 'bg-red-500/10 border-red-500/20' : 'bg-amber-500/10 border-amber-500/20'
        }`}>
          <AlertTriangle className={`h-6 w-6 ${isDanger ? 'text-red-400' : 'text-amber-400'}`} />
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
        <Button variant="outline" className="flex-1 h-12 text-base" onClick={onCancel}>
          Cancel
        </Button>
        <button
          onClick={onConfirm}
          className={`flex-1 inline-flex items-center justify-center gap-2 h-12 px-4 rounded-lg text-base font-medium text-white transition-colors ${
            isDanger
              ? 'bg-red-500 hover:bg-red-600 active:bg-red-700'
              : 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700'
          }`}
        >
          {isDanger ? <Trash2 className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
          {confirmLabel}
        </button>
      </div>
    </>
  );
}
