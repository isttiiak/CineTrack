import { useEffect, useRef, useCallback } from 'react';
import { loadUserWatchlist, saveUserWatchlist, saveUserProfile } from '../lib/firestore';
import type { WatchlistState, UserProfile } from '../types';

export function useFirestore(uid: string | null) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncRef = useRef<string | null>(null);

  const load = useCallback(async (): Promise<WatchlistState | null> => {
    if (!uid) return null;
    return loadUserWatchlist(uid);
  }, [uid]);

  const save = useCallback((state: WatchlistState) => {
    if (!uid) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await saveUserWatchlist(uid, state);
      lastSyncRef.current = new Date().toISOString();
    }, 1500);
  }, [uid]);

  const saveProfile = useCallback(async (profile: UserProfile) => {
    if (!uid) return;
    await saveUserProfile(uid, profile);
  }, [uid]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { load, save, saveProfile, lastSyncRef };
}
