import { useState, useCallback, useEffect, useRef } from 'react';
import type { MovieEntry, WatchMeta, WatchlistState, WatchStatus, Section } from '../types';
import { seedMovies } from '../data/seedMovies';
import { getLocalStorage, setLocalStorage } from './useLocalStorage';
import { useFirestore } from './useFirestore';
import { SECTIONS, todayKey } from '../lib/utils';
import { normalizeState, withAllSections } from '../lib/schema';
import { findDuplicate } from '../lib/duplicates';
import { mergeWatchlist, sameContent } from '../lib/merge';
import { subscribeUserWatchlist } from '../lib/firestore';

const LS_KEY = 'cinetrack_state_v1';
const LS_BASE_KEY = 'cinetrack_base_v1';   // last cloud version this device saw (merge ancestor)
const LS_UID_KEY = 'cinetrack_last_uid';
const uuid = () => crypto.randomUUID();
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
 * Records today's date when an existing entry is switched to "watched" with one tap (status badge,
 * drawer, bulk action), so stats and the heatmap fill themselves. Not used when adding or editing
 * through a form: there the date field is visible, and an empty date means "don't know".
 */
function stampWatched(prev: WatchMeta | undefined, next: WatchMeta): WatchMeta {
  if (next.status === 'watched' && prev?.status !== 'watched' && !next.watchedOn) {
    return { ...next, watchedOn: todayKey() };
  }
  return next;
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

export function useWatchlist(uid: string | null) {
  const [state, setState] = useState<WatchlistState>(() => readLocal() ?? buildInitialState());
  // stateRef is the source of truth for mutations: several mutations in one tick (bulk actions)
  // each build on the previous result instead of the same stale render-time `state`.
  const stateRef = useRef(state);
  const baseRef = useRef<WatchlistState | null>(null);
  const uidRef = useRef(uid);
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

  // The base is persisted so edits made offline (or in a tab closed before its save finished)
  // can be merged with the cloud copy on the next visit instead of one side overwriting the other.
  const setBase = useCallback((next: WatchlistState | null) => {
    baseRef.current = next;
    if (next) setLocalStorage(LS_BASE_KEY, next);
    else localStorage.removeItem(LS_BASE_KEY);
  }, []);

  const cloud = useFirestore(uid, {
    getLocal: () => stateRef.current,
    getBase: () => baseRef.current,
    onSynced: (syncedUid, sent, saved) => {
      if (syncedUid !== uidRef.current) return;     // account switched while the save was in flight
      setBase(saved);
      const current = stateRef.current;
      // Keep edits made while the save was running; take everything else from the cloud copy.
      const next = current === sent ? saved : mergeWatchlist(sent, current, saved);
      if (!sameContent(next, current)) replaceState(next);
    },
  });
  const { load: firestoreLoad, requestSave } = cloud;

  useEffect(() => {
    const prevUid = prevUidRef.current;
    prevUidRef.current = uid;
    uidRef.current = uid;
    cloudReadyRef.current = false;
    setCloudError(false);
    baseRef.current = null;

    if (!uid) {
      // Signed out: don't leave the previous account's private list (notes, watch links) on screen.
      if (prevUid) {
        localStorage.removeItem(LS_UID_KEY);
        setBase(null);
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
        if (sameUser && local) {
          // Pick up edits this device made offline or in a tab closed mid-save. Data saved by
          // older versions has no stored base; then fall back to whichever copy is newer.
          const storedBase = normalizeState(getLocalStorage<unknown>(LS_BASE_KEY));
          use = storedBase
            ? mergeWatchlist(storedBase, local, remote)
            : local.lastModified > remote.lastModified ? local : remote;
          push = !sameContent(use, remote);
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
      setBase(remote);
      replaceState(use);
      setLocalStorage(LS_UID_KEY, uid);
      cloudReadyRef.current = true;
      setInitialised(true);
      if (push) requestSave();

      // Changes from other tabs/devices are merged in, never compared by (device) clock.
      unsubscribe = subscribeUserWatchlist(uid, (incoming) => {
        const current = stateRef.current;
        const merged = mergeWatchlist(baseRef.current, current, incoming);
        setBase(incoming);
        if (!sameContent(merged, current)) replaceState(merged);
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
    if (uid && cloudReadyRef.current) requestSave();
  }, [uid, requestSave, replaceState]);

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
      for (const id of ids) meta[id] = stampWatched(meta[id], { ...(meta[id] ?? { id }), id, status });
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

  /** Series progress: last watched episode (or null to reset), with the status that follows from it. */
  const setProgress = useCallback((id: string, pos: { season: number; episode: number } | null, status: WatchStatus) => {
    mutate((s) => {
      const prev = s.meta[id];
      const next: WatchMeta = { ...(prev ?? { id, status: 'plan' as WatchStatus }), id, status };
      delete next.progressSeason; delete next.progressEpisode;
      if (pos) { next.progressSeason = pos.season; next.progressEpisode = pos.episode; }
      return { ...s, meta: { ...s.meta, [id]: stampWatched(prev, next) } };
    });
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

  const { saveNow } = cloud;
  const forceSync = useCallback(async () => {
    if (!uid || !cloudReadyRef.current) throw new Error('Cloud data not loaded yet');
    await saveNow();
  }, [uid, saveNow]);

  return {
    state, initialised, cloudError, retrySync,
    addEntry, updateEntry, deleteEntry, deleteEntries,
    setStatus, setStatuses, setMeta, setProgress, reorderSections,
    updatePoster, exportJSON, parseImport, applyImport,
    forceSync,
    flush: cloud.flush, lastSync: cloud.lastSync, syncStatus: cloud.status,
  };
}
