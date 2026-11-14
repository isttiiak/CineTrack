import { useEffect, useRef, useCallback, useState } from 'react';
import { loadUserWatchlist, syncUserWatchlist } from '../lib/firestore';
import type { WatchlistState, SyncStatus } from '../types';

const DEBOUNCE_MS = 1500;

export interface SyncHandlers {
  /** The current local list; read when the save actually runs, so it is never stale. */
  getLocal: () => WatchlistState;
  /** The cloud version this device last saw (the merge ancestor). */
  getBase: () => WatchlistState | null;
  /** Called after a successful save with what was sent and what the cloud now holds. */
  onSynced: (uid: string, sent: WatchlistState, cloud: WatchlistState) => void;
}

/**
 * Debounced, serialised cloud saves. Callers only mark the list dirty (`requestSave`); the save
 * reads the latest local state when it runs and merges it with the cloud copy in a transaction.
 */
export function useFirestore(uid: string | null, handlers: SyncHandlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const haltedRef = useRef(false);      // set while the account's cloud data is being deleted
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>(uid ? 'loading' : 'local');

  // A new account must never receive the previous account's queued write.
  useEffect(() => {
    dirtyRef.current = false;
    haltedRef.current = false;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    setStatus(uid ? 'loading' : 'local');
    setLastSync(null);
  }, [uid]);

  const write = useCallback(async (): Promise<void> => {
    if (!uid) return;
    // One save at a time: a second save waits, then sends whatever is newest.
    while (inFlightRef.current) await inFlightRef.current.catch(() => {});
    if (!dirtyRef.current || haltedRef.current) return;
    dirtyRef.current = false;
    setStatus('saving');
    const run = (async () => {
      const { getLocal, getBase, onSynced } = handlersRef.current;
      const sent = getLocal();
      try {
        const cloud = await syncUserWatchlist(uid, getBase(), sent);
        onSynced(uid, sent, cloud);
        setLastSync(new Date().toISOString());
        setStatus(dirtyRef.current ? 'saving' : 'saved');
      } catch (err) {
        console.error('Firestore save failed:', err);
        dirtyRef.current = true;           // retried on the next edit, reconnect, or tab hide
        setStatus('error');
        throw err;
      }
    })();
    inFlightRef.current = run;
    try { await run; } finally { if (inFlightRef.current === run) inFlightRef.current = null; }
  }, [uid]);

  const load = useCallback(async (): Promise<WatchlistState | null> => {
    if (!uid) return null;
    setStatus('loading');
    try {
      const remote = await loadUserWatchlist(uid);
      setStatus('saved');
      if (remote) setLastSync(new Date().toISOString());
      return remote;
    } catch (err) {
      setStatus('error');
      throw err;
    }
  }, [uid]);

  /** Sends pending changes now. Never throws. */
  const flush = useCallback(async () => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (dirtyRef.current) await write().catch(() => {});
  }, [write]);

  const requestSave = useCallback(() => {
    if (!uid || haltedRef.current) return;
    dirtyRef.current = true;
    setStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void flush(); }, DEBOUNCE_MS);
  }, [uid, flush]);

  /** Saves now and rejects if the save fails (for the manual "Sync now" button). */
  const saveNow = useCallback(async () => {
    if (haltedRef.current) return;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    dirtyRef.current = true;
    await write();
  }, [write]);

  // Flush when the tab is hidden or closed so edits made within the debounce window are sent,
  // and retry a failed save as soon as the connection comes back.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') void flush(); };
    const onOnline = () => { void flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', flush);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('online', onOnline);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [flush]);

  /**
   * Stops all cloud writes (queued ones are dropped, a running one is awaited). Used while the
   * account's data is deleted: a late save would otherwise recreate the document. Undo with `resume`.
   */
  const halt = useCallback(async () => {
    haltedRef.current = true;
    dirtyRef.current = false;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    while (inFlightRef.current) await inFlightRef.current.catch(() => {});
  }, []);
  const resume = useCallback(() => { haltedRef.current = false; }, []);

  return { load, requestSave, saveNow, flush, halt, resume, lastSync, status };
}
