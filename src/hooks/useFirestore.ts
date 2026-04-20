import { useEffect, useRef, useCallback } from 'react';
import { loadUserWatchlist, saveUserWatchlist, saveUserProfile } from '../lib/firestore';
import type { WatchlistState, UserProfile } from '../types';

export function useFirestore(uid: string | null) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncRef = useRef<string | null>(null);
  const pendingRef  = useRef<WatchlistState | null>(null);

  const load = useCallback(async (): Promise<WatchlistState | null> => {
    if (!uid) return null;
    return loadUserWatchlist(uid);
  }, [uid]);

  const save = useCallback((state: WatchlistState) => {
    if (!uid) return;
    pendingRef.current = state;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await saveUserWatchlist(uid, state);
      lastSyncRef.current = new Date().toISOString();
      pendingRef.current = null;
    }, 1500);
  }, [uid]);

  const saveProfile = useCallback(async (profile: UserProfile) => {
    if (!uid) return;
    await saveUserProfile(uid, profile);
  }, [uid]);

  // Flush any pending debounced save when the tab is hidden or closed.
  // This prevents data loss when the user closes the tab within 1.5s of their last edit.
  useEffect(() => {
    const flush = () => {
      if (!uid || !pendingRef.current) return;
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      const snap = pendingRef.current;
      pendingRef.current = null;
      saveUserWatchlist(uid, snap).then(() => {
        lastSyncRef.current = new Date().toISOString();
      }).catch(() => {});
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', flush);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [uid]);

  const saveImmediate = useCallback(async (state: WatchlistState): Promise<void> => {
    if (!uid) return;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    pendingRef.current = null;
    await saveUserWatchlist(uid, state);
    lastSyncRef.current = new Date().toISOString();
  }, [uid]);

  return { load, save, saveImmediate, saveProfile, lastSyncRef };
}
