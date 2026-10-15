import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import type { MovieEntry, WatchMeta, WatchlistState, WatchStatus, Section } from '../types';
import { seedMovies } from '../data/seedMovies';
import { getLocalStorage, setLocalStorage } from './useLocalStorage';
import { SECTIONS } from '../lib/utils';
import { normalizeState, withAllSections } from '../lib/schema';
import { findDuplicate } from '../lib/duplicates';
import { subscribeUserWatchlist } from '../lib/firestore';

const LS_KEY = 'cinetrack_state_v1';
const LS_UID_KEY = 'cinetrack_last_uid';
const EXPORT_VERSION = 1;

export type ImportMode = 'merge' | 'replace';
export interface ImportResult { ok: boolean; added: number; skipped: number; error?: string }

function buildInitialState(): WatchlistState {
  return {
    entries: seedMovies.map((m) => ({ ...m })),
    meta: Object.fromEntries(seedMovies.map((m) => [m.id, { id: m.id, status: 'plan' as WatchStatus }])),
    sectionOrder: SECTIONS.slice() as Section[],
    lastModified: new Date().toISOString(),
  };
}

function readLocal(): WatchlistState | null {
  return normalizeState(getLocalStorage<unknown>(LS_KEY));
}

/**
 * Adds entries from `incoming` that are not already in `base` (by duplicate rules, not just id).
 * With `onlyCustom`, untouched seed entries are ignored so a guest's seed list can't resurrect
 * titles the user deleted from their cloud list.
 */
function mergeStates(base: WatchlistState, incoming: WatchlistState, onlyCustom: boolean) {
  const entries = [...base.entries];
  const meta = { ...base.meta };
  let added = 0, skipped = 0;
  for (const entry of incoming.entries) {
    if (onlyCustom && !entry.isCustom) continue;
    if (findDuplicate(entries, entry)) { skipped++; continue; }
    const id = meta[entry.id] || entries.some((e) => e.id === entry.id) ? uuid() : entry.id;
    entries.push({ ...entry, id });
    meta[id] = { ...(incoming.meta[entry.id] ?? { status: 'plan' }), id };
    added++;
  }
  const sectionOrder = withAllSections(
    [...base.sectionOrder, ...incoming.sectionOrder.filter((s) => !base.sectionOrder.includes(s))],
    entries,
  ).filter((s) => SECTIONS.includes(s as typeof SECTIONS[number]) || entries.some((e) => e.section === s));
  return { state: { ...base, entries, meta, sectionOrder }, added, skipped };
}

export function useWatchlist(
  uid: string | null,
  firestoreLoad: () => Promise<WatchlistState | null>,
  firestoreSave: (s: WatchlistState) => void
) {
  const [state, setState] = useState<WatchlistState>(() => readLocal() ?? buildInitialState());
  // stateRef is the source of truth for mutations: several mutations in one tick (bulk actions)
  // each build on the previous result instead of the same stale render-time `state`.
  const stateRef = useRef(state);
  const [initialised, setInitialised] = useState(false);
  // Cloud writes are allowed only after a successful load + reconcile. If the load fails we stay
  // local-only, so a stale local copy can never overwrite the real cloud document.
  const cloudReadyRef = useRef(false);
  const [cloudError, setCloudError] = useState(false);
  const prevUidRef = useRef<string | null>(uid);
  const [syncAttempt, setSyncAttempt] = useState(0);

  const replaceState = useCallback((next: WatchlistState) => {
    stateRef.current = next;
    setState(next);
    setLocalStorage(LS_KEY, next);
  }, []);

  useEffect(() => {
    const prevUid = prevUidRef.current;
    prevUidRef.current = uid;
    cloudReadyRef.current = false;
    setCloudError(false);

    if (!uid) {
      // Signed out: don't leave the previous account's private list (notes, watch links) on screen.
      if (prevUid) {
        localStorage.removeItem(LS_UID_KEY);
        replaceState(buildInitialState());
      }
      setInitialised(true);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    setInitialised(false);

    const lastUid = getLocalStorage<string>(LS_UID_KEY);
    const sameUser = lastUid === uid;
    const guestData = lastUid === null;       // local data was created as a guest on this device
    const otherUsersData = !sameUser && !guestData;

    firestoreLoad().then((remote) => {
      if (cancelled) return;
      const local = readLocal();
      let use: WatchlistState;
      let push = false;

      if (remote) {
        if (sameUser && local && local.lastModified > remote.lastModified) {
          use = local; push = true;           // unsynced edits from a closed tab / offline session
        } else if (guestData && local) {
          const merged = mergeStates(remote, local, true);
          use = merged.state; push = merged.added > 0;
        } else {
          use = remote;
        }
      } else {
        use = otherUsersData || !local ? buildInitialState() : local;
        push = true;                          // first sign-in: create the cloud document
      }

      if (push) use = { ...use, lastModified: new Date().toISOString() };
      replaceState(use);
      if (push) firestoreSave(use);
      setLocalStorage(LS_UID_KEY, uid);
      cloudReadyRef.current = true;
      setInitialised(true);

      unsubscribe = subscribeUserWatchlist(uid, (incoming) => {
        if (incoming.lastModified > stateRef.current.lastModified) replaceState(incoming);
      });
    }).catch((err) => {
      if (cancelled) return;
      console.error('Firestore load failed:', err);
      if (otherUsersData) replaceState(buildInitialState());
      setCloudError(true);
      setInitialised(true);
    });

    return () => { cancelled = true; unsubscribe?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, syncAttempt]);

  const retrySync = useCallback(() => setSyncAttempt((n) => n + 1), []);

  const mutate = useCallback((fn: (s: WatchlistState) => WatchlistState) => {
    const next = { ...fn(stateRef.current), lastModified: new Date().toISOString() };
    replaceState(next);
    if (uid && cloudReadyRef.current) firestoreSave(next);
  }, [uid, firestoreSave, replaceState]);

  const addEntry = useCallback((entry: Omit<MovieEntry, 'id' | 'isCustom'>, meta: Partial<WatchMeta> = {}) => {
    const id = uuid();
    mutate((s) => {
      const entries = [...s.entries, { ...entry, id, isCustom: true }];
      return {
        ...s,
        entries,
        meta: { ...s.meta, [id]: { status: 'plan', ...meta, id } },
        sectionOrder: withAllSections(s.sectionOrder, entries),
      };
    });
    return id;
  }, [mutate]);

  const updateEntry = useCallback((id: string, patch: Partial<MovieEntry>, metaPatch: Partial<WatchMeta> = {}) => {
    mutate((s) => {
      const entries = s.entries.map((e) => e.id === id ? { ...e, ...patch, id } : e);
      const existing = s.meta[id] ?? { id, status: 'plan' as WatchStatus };
      return {
        ...s,
        entries,
        meta: { ...s.meta, [id]: { ...existing, ...metaPatch, id } },
        sectionOrder: withAllSections(s.sectionOrder, entries),
      };
    });
  }, [mutate]);

  const deleteEntries = useCallback((ids: string[]) => {
    const drop = new Set(ids);
    mutate((s) => ({
      ...s,
      entries: s.entries.filter((e) => !drop.has(e.id)),
      meta: Object.fromEntries(Object.entries(s.meta).filter(([k]) => !drop.has(k))),
    }));
  }, [mutate]);

  const deleteEntry = useCallback((id: string) => deleteEntries([id]), [deleteEntries]);

  const setStatuses = useCallback((ids: string[], status: WatchStatus) => {
    mutate((s) => {
      const meta = { ...s.meta };
      for (const id of ids) meta[id] = { ...(meta[id] ?? { id }), id, status };
      return { ...s, meta };
    });
  }, [mutate]);

  const setStatus = useCallback((id: string, status: WatchStatus) => setStatuses([id], status), [setStatuses]);

  const setMeta = useCallback((id: string, patch: Partial<WatchMeta>) => {
    mutate((s) => ({
      ...s,
      meta: { ...s.meta, [id]: { ...(s.meta[id] ?? { status: 'plan' as WatchStatus }), ...patch, id } },
    }));
  }, [mutate]);

  const reorderSections = useCallback((newOrder: Section[]) => {
    mutate((s) => ({ ...s, sectionOrder: withAllSections(newOrder, s.entries) }));
  }, [mutate]);

  const updatePoster = useCallback((id: string, posterUrl: string) => {
    mutate((s) => ({ ...s, entries: s.entries.map((e) => e.id === id ? { ...e, posterUrl } : e) }));
  }, [mutate]);

  const exportJSON = useCallback(() => {
    const payload = { app: 'cinetrack', version: EXPORT_VERSION, exportedAt: new Date().toISOString(), data: stateRef.current };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cinetrack-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);   // Firefox ignores clicks on detached anchors
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);   // revoking synchronously can cancel the download
  }, []);

  /** Parses an export file (current envelope, legacy raw state, or a bare entries array) without applying it. */
  const parseImport = useCallback((json: string): WatchlistState | null => {
    try {
      let raw = JSON.parse(json);
      if (Array.isArray(raw)) raw = { entries: raw };
      if (raw && typeof raw === 'object' && 'data' in raw && raw.app === 'cinetrack') raw = raw.data;
      const parsed = normalizeState(raw);
      return parsed && parsed.entries.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  }, []);

  const applyImport = useCallback((imported: WatchlistState, mode: ImportMode): ImportResult => {
    if (mode === 'replace') {
      mutate(() => imported);
      return { ok: true, added: imported.entries.length, skipped: 0 };
    }
    const merged = mergeStates(stateRef.current, imported, false);
    if (merged.added > 0) mutate(() => merged.state);
    return { ok: true, added: merged.added, skipped: merged.skipped };
  }, [mutate]);

  const forceSync = useCallback(async (saveImmediate: (s: WatchlistState) => Promise<void>) => {
    if (!uid || !cloudReadyRef.current) throw new Error('Cloud data not loaded yet');
    const next = { ...stateRef.current, lastModified: new Date().toISOString() };
    replaceState(next);
    await saveImmediate(next);
  }, [uid, replaceState]);

  return {
    state, initialised, cloudError, retrySync,
    addEntry, updateEntry, deleteEntry, deleteEntries,
    setStatus, setStatuses, setMeta, reorderSections,
    updatePoster, exportJSON, parseImport, applyImport,
    forceSync,
  };
}
