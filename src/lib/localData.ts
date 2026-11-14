import type { WatchlistState } from '../types';
import { SECTIONS } from './utils';
import { clearAnalyticsCookies } from './analytics';
import { resetOfflineCache } from './pwa';

/** Everything CineTrack keeps in this browser lives under this prefix (see CLAUDE.md for the keys). */
const PREFIX = 'cinetrack_';
export const LS_STATE_KEY = 'cinetrack_state_v1';     // list cache / guest data
export const LS_BASE_KEY = 'cinetrack_base_v1';       // last cloud version seen (merge base)
export const LS_UID_KEY = 'cinetrack_last_uid';
const WIPE_FLAG = 'cinetrack_wipe_pending';
const KEEP_KEY = 'cinetrack_analytics';               // the visitor's usage-statistics choice (lib/consent.ts)

export function emptyWatchlist(): WatchlistState {
  return { entries: [], meta: {}, sectionOrder: [...SECTIONS], lastModified: new Date().toISOString() };
}

export type WipeMode =
  | 'keep-empty-list'   // guest "erase everything": settings, caches and cookies reset; the list stays, empty
  | 'everything';       // after account deletion: back to a brand-new visitor

/**
 * Erases what CineTrack stored in this browser: local storage, the offline copy and cached
 * posters/API answers, and the analytics cookies; then reloads.
 *
 * The actual removal of local storage happens at the next startup (`applyPendingWipe`, called
 * before anything reads storage). Doing it here would race with the page's own late writes
 * (React effects, a debounced save) that could put data straight back.
 */
export async function wipeLocalDataAndReload(mode: WipeMode): Promise<void> {
  try { localStorage.setItem(WIPE_FLAG, mode); } catch { /* storage unavailable: nothing to wipe */ }
  clearAnalyticsCookies();
  await resetOfflineCache();
  window.location.replace('/');
}

/** Runs first thing at startup; finishes a wipe started by `wipeLocalDataAndReload`. */
export function applyPendingWipe(): void {
  try {
    const mode = localStorage.getItem(WIPE_FLAG);
    if (!mode) return;
    // The analytics choice is a privacy preference, not user data: erasing everything must not
    // silently turn tracking back on for someone who had opted out.
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX) && key !== KEEP_KEY) localStorage.removeItem(key);
    try { sessionStorage.clear(); } catch { /* ignore */ }
    if (mode === 'keep-empty-list') localStorage.setItem(LS_STATE_KEY, JSON.stringify(emptyWatchlist()));
  } catch { /* storage blocked */ }
}
