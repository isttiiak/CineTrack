import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { WatchlistState, UserProfile } from '../types';

export async function loadUserWatchlist(uid: string): Promise<WatchlistState | null> {
  const ref = doc(db, 'users', uid, 'data', 'watchlist');
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as WatchlistState) : null;
}

export async function saveUserWatchlist(uid: string, state: WatchlistState): Promise<void> {
  const ref = doc(db, 'users', uid, 'data', 'watchlist');
  // No merge: true — always write the complete document so arrays (entries, sectionOrder)
  // are fully replaced and never left in a split state with the old meta keys.
  await setDoc(ref, state);
}

export async function saveUserProfile(uid: string, profile: UserProfile): Promise<void> {
  const ref = doc(db, 'users', uid, 'data', 'profile');
  await setDoc(ref, { ...profile, updatedAt: new Date().toISOString() }, { merge: true });
}
