import { doc, getDoc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeState, stripUndefined } from './schema';
import { mergeWatchlist, sameContent } from './merge';
import type { WatchlistState, UserProfile } from '../types';

const watchlistRef = (uid: string) => doc(db, 'users', uid, 'data', 'watchlist');

export async function loadUserWatchlist(uid: string): Promise<WatchlistState | null> {
  const snap = await getDoc(watchlistRef(uid));
  return snap.exists() ? normalizeState(snap.data()) : null;
}

/**
 * Saves `local` without losing edits another device made meanwhile. Inside a transaction it reads
 * the current cloud copy, three-way merges it with `local` using `base` (the cloud version this
 * device last saw), and writes the result. Firestore re-runs the function if the document changes
 * before the write commits, so two devices saving at once can't overwrite each other.
 * Resolves with what the cloud now holds.
 */
export async function syncUserWatchlist(uid: string, base: WatchlistState | null, local: WatchlistState): Promise<WatchlistState> {
  const ref = watchlistRef(uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const remote = snap.exists() ? normalizeState(snap.data()) : null;
    const merged = remote ? mergeWatchlist(base, local, remote) : local;
    if (remote && sameContent(merged, remote)) return remote;   // nothing new to write
    const out = { ...merged, lastModified: new Date().toISOString() };
    tx.set(ref, stripUndefined(out));
    return out;
  });
}

/** Streams changes made by other tabs/devices. Local (pending) writes are skipped. */
export function subscribeUserWatchlist(uid: string, onRemote: (state: WatchlistState) => void): () => void {
  return onSnapshot(watchlistRef(uid), (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const state = normalizeState(snap.data());
    if (state) onRemote(state);
  }, () => { /* transient listener errors are surfaced by the next save */ });
}

/** Stores only what's needed to show the account; the email stays in Firebase Auth. */
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const ref = doc(db, 'users', profile.uid, 'data', 'profile');
  // Full overwrite (no merge) so fields from older versions, such as `email`, are removed.
  await setDoc(ref, { uid: profile.uid, name: profile.name, avatar: profile.avatar, updatedAt: new Date().toISOString() });
}
