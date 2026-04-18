import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import type { ToastMessage } from '@/types';

interface Props {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

const ICONS = {
  success: <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />,
  error: <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />,
  info: <Info className="h-4 w-4 text-blue-400 flex-shrink-0" />,
};

export function ToastContainer({ toasts, onRemove }: Props) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 60, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3 shadow-lg text-sm text-[var(--text-primary)] min-w-[220px] max-w-[320px]"
          >
            {ICONS[t.type]}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => onRemove(t.id)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
