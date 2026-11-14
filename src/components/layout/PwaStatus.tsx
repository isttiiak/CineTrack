import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, WifiOff } from 'lucide-react';
import { reloadForUpdate, useOnline, usePwa } from '@/lib/pwa';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

/**
 * Two small status chips, bottom-left so they never cover the toasts (bottom-right):
 *  - offline: reassures that the list is on this device and will sync when back online;
 *  - new version ready: updating reloads the page, so it's the user's call (never mid-edit).
 */
export function PwaStatus() {
  const online = useOnline();
  const { updateReady } = usePwa();
  const [later, setLater] = useState(false);

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2">
      <AnimatePresence>
        {!online && (
          <motion.div
            key="offline"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-lg"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <WifiOff className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
            <span>Offline. Your list is saved on this device and syncs when you're back.</span>
          </motion.div>
        )}
        {updateReady && !later && (
          <motion.div
            key="update"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            role="status"
            className="pointer-events-auto flex items-center gap-3 rounded-xl border px-3 py-2 text-xs shadow-lg"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--accent)', color: 'var(--text-secondary)' }}
          >
            <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--accent-text)' }} />
            <span>A new version is ready.</span>
            <Button size="sm" onClick={reloadForUpdate}>Reload</Button>
            <button onClick={() => setLater(true)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">Later</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
