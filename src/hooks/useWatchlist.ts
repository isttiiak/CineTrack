import { useState, useCallback, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import type { MovieEntry, WatchMeta, WatchlistState, WatchStatus, Section } from '../types';
import { seedMovies, defaultMeta } from '../data/seedMovies';
import { getLocalStorage, setLocalStorage } from './useLocalStorage';
import { SECTIONS } from '../lib/utils';

const LS_KEY = 'cinetrack_state_v1';
const LS_UID_KEY = 'cinetrack_last_uid';

function buildInitialState(): WatchlistState {
  return {
    entries: seedMovies,
    meta: defaultMeta as Record<string, WatchMeta>,
    sectionOrder: SECTIONS.slice() as Section[],
    lastModified: new Date().toISOString(),
  };
}

export function useWatchlist(
  uid: string | null,
  firestoreLoad: () => Promise<WatchlistState | null>,
  firestoreSave: (s: WatchlistState) => void
) {
  const [state, setState] = useState<WatchlistState>(() => {
    const cached = getLocalStorage<WatchlistState>(LS_KEY);
    return cached ?? buildInitialState();
  });
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (!uid) { setInitialised(true); return; }

    // sameUser = this exact UID was already signed in on this device before.
    // Only in that case can local localStorage data be "newer" than Firestore
    // (e.g. tab was closed before the debounce fired).
    // For a fresh device or a different account, Firestore always wins.
    const lastUid = getLocalStorage<string>(LS_UID_KEY);
    const sameUser = lastUid === uid;
    const isDifferentUser = lastUid !== null && lastUid !== uid;

    firestoreLoad().then((remote) => {
      if (remote) {
        if (sameUser) {
          // Same user, same device: local may have unsaved edits from a closed tab
          const local = getLocalStorage<WatchlistState>(LS_KEY);
          const localIsNewer = local != null && local.lastModified > remote.lastModified;
          const use = localIsNewer ? local : remote;
          setState(use);
          setLocalStorage(LS_KEY, use);
          if (localIsNewer) firestoreSave(local!);
        } else {
          // First sign-in on this device, OR a different Google account:
          // always pull from Firestore — never let seed/local data overwrite real data.
          setState(remote);
          setLocalStorage(LS_KEY, remote);
        }
      } else {
        if (sameUser) {
          // Same user but Firestore is empty (shouldn't normally happen): push local up
          firestoreSave(state);
        } else if (isDifferentUser) {
          // Different user with no Firestore data: give them a clean seed
          const fresh = buildInitialState();
          setState(fresh);
          setLocalStorage(LS_KEY, fresh);
          firestoreSave(fresh);
        } else {
          // Truly new user (no lastUid stored): write current local/seed to Firestore
          firestoreSave(state);
        }
      }
      setLocalStorage(LS_UID_KEY, uid);
      setInitialised(true);
    }).catch(() => setInitialised(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const commit = useCallback((next: WatchlistState) => {
    const updated = { ...next, lastModified: new Date().toISOString() };
    setState(updated);
    setLocalStorage(LS_KEY, updated);
    if (uid) firestoreSave(updated);
  }, [uid, firestoreSave]);

  const addEntry = useCallback((entry: Omit<MovieEntry, 'id' | 'isCustom'>, meta: Partial<WatchMeta> = {}) => {
    const id = uuid();
    const newEntry: MovieEntry = { ...entry, id, isCustom: true };
    const newMeta: WatchMeta = { id, status: 'plan', ...meta };
    const sectionOrder = state.sectionOrder.includes(entry.section)
      ? state.sectionOrder
      : [...state.sectionOrder, entry.section];
    commit({
      ...state,
      entries: [...state.entries, newEntry],
      meta: { ...state.meta, [id]: newMeta },
      sectionOrder,
    });
    return id;
  }, [state, commit]);

  const updateEntry = useCallback((id: string, patch: Partial<MovieEntry>, metaPatch: Partial<WatchMeta> = {}) => {
    const existingMeta = state.meta[id] ?? { id, status: 'plan' as WatchStatus };
    commit({
      ...state,
      entries: state.entries.map((e) => e.id === id ? { ...e, ...patch } : e),
      meta: { ...state.meta, [id]: { ...existingMeta, ...metaPatch } },
    });
  }, [state, commit]);

  const deleteEntry = useCallback((id: string) => {
    const meta = { ...state.meta };
    delete meta[id];
    commit({ ...state, entries: state.entries.filter((e) => e.id !== id), meta });
  }, [state, commit]);

  const setStatus = useCallback((id: string, status: WatchStatus) => {
    const existing = state.meta[id] ?? { id, status: 'plan' };
    commit({ ...state, meta: { ...state.meta, [id]: { ...existing, status } } });
  }, [state, commit]);

  const setMeta = useCallback((id: string, patch: Partial<WatchMeta>) => {
    const existing = state.meta[id] ?? { id, status: 'plan' as WatchStatus };
    commit({ ...state, meta: { ...state.meta, [id]: { ...existing, ...patch } } });
  }, [state, commit]);

  const reorderSections = useCallback((newOrder: Section[]) => {
    commit({ ...state, sectionOrder: newOrder });
  }, [state, commit]);

  const updatePoster = useCallback((id: string, posterUrl: string) => {
    setState((prev) => {
      const updated = {
        ...prev,
        entries: prev.entries.map((e) => e.id === id ? { ...e, posterUrl } : e),
        lastModified: new Date().toISOString(),
      };
      setLocalStorage(LS_KEY, updated);
      if (uid) firestoreSave(updated);
      return updated;
    });
  }, [uid, firestoreSave]);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cinetrack-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importJSON = useCallback((json: string) => {
    try {
      const imported = JSON.parse(json) as WatchlistState;
      commit(imported);
      return true;
    } catch {
      return false;
    }
  }, [commit]);

  const forceSync = useCallback(() => {
    if (uid) firestoreSave({ ...state, lastModified: new Date().toISOString() });
  }, [uid, state, firestoreSave]);

  return {
    state, initialised,
    addEntry, updateEntry, deleteEntry,
    setStatus, setMeta, reorderSections,
    updatePoster, exportJSON, importJSON,
    forceSync,
  };
}
