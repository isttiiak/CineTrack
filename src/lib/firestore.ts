import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { normalizeState, stripUndefined } from './schema';
import type { WatchlistState, UserProfile } from '../types';

const watchlistRef = (uid: string) => doc(db, 'users', uid, 'data', 'watchlist');

export async function loadUserWatchlist(uid: string): Promise<WatchlistState | null> {
  const snap = await getDoc(watchlistRef(uid));
  return snap.exists() ? normalizeState(snap.data()) : null;
}

export async function saveUserWatchlist(uid: string, state: WatchlistState): Promise<void> {
  // No merge: true — always write the complete document so arrays (entries, sectionOrder)
  // are fully replaced and never left in a split state with the old meta keys.
  await setDoc(watchlistRef(uid), stripUndefined(state));
}

/** Streams remote changes made by other tabs/devices. Local (pending) writes are skipped. */
export function subscribeUserWatchlist(uid: string, onRemote: (state: WatchlistState) => void): () => void {
  return onSnapshot(watchlistRef(uid), (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const state = normalizeState(snap.data());
    if (state) onRemote(state);
  }, () => { /* transient listener errors are surfaced by the next save */ });
}

export async function saveUserProfile(uid: string, profile: UserProfile): Promise<void> {
  const ref = doc(db, 'users', uid, 'data', 'profile');
  await setDoc(ref, { ...profile, updatedAt: new Date().toISOString() }, { merge: true });
}
