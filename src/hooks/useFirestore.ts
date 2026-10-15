import { useEffect, useRef, useCallback, useState } from 'react';
import { loadUserWatchlist, saveUserWatchlist, saveUserProfile } from '../lib/firestore';
import type { WatchlistState, UserProfile, SyncStatus } from '../types';

const DEBOUNCE_MS = 1500;

export function useFirestore(uid: string | null) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef  = useRef<WatchlistState | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>(uid ? 'loading' : 'local');

  // A new account must never receive the previous account's queued write.
  useEffect(() => {
    pendingRef.current = null;
    setStatus(uid ? 'loading' : 'local');
    setLastSync(null);
  }, [uid]);

  const write = useCallback(async (state: WatchlistState) => {
    if (!uid) return;
    setStatus('saving');
    try {
      await saveUserWatchlist(uid, state);
      setLastSync(new Date().toISOString());
      setStatus('saved');
    } catch (err) {
      console.error('Firestore save failed:', err);
      setStatus('error');
      throw err;
    }
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

  const flush = useCallback(async () => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const snap = pendingRef.current;
    pendingRef.current = null;
    if (snap) await write(snap).catch(() => { pendingRef.current ??= snap; });
  }, [write]);

  const save = useCallback((state: WatchlistState) => {
    if (!uid) return;
    pendingRef.current = state;
    setStatus('saving');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void flush(); }, DEBOUNCE_MS);
  }, [uid, flush]);

  const saveImmediate = useCallback(async (state: WatchlistState): Promise<void> => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    pendingRef.current = null;
    await write(state);
  }, [write]);

  const saveProfile = useCallback(async (profile: UserProfile) => {
    if (!uid) return;
    await saveUserProfile(uid, profile);
  }, [uid]);

  // Flush any pending debounced save when the tab is hidden or closed, so edits made
  // within the debounce window are not lost.
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', flush);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [flush]);

  return { load, save, saveImmediate, saveProfile, flush, lastSync, status };
}
