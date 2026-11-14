import { useState, useEffect } from 'react';
import { deleteUser, getRedirectResult, onAuthStateChanged, reauthenticateWithPopup, signInWithPopup, signInWithRedirect, signOut as firebaseSignOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import type { UserProfile } from '../types';

/** Pop-ups don't work in an iOS home-screen app, so it signs in with a full-page redirect instead. */
function isIosStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true
    || (/iPad|iPhone|iPod/.test(navigator.userAgent) && window.matchMedia('(display-mode: standalone)').matches);
}

const POPUP_UNSUPPORTED = new Set(['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment']);

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Completes a redirect sign-in; the user itself arrives through onAuthStateChanged.
    getRedirectResult(auth).catch((err) => console.error('Redirect sign-in failed:', err));
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || 'User',
          email: firebaseUser.email || '',
          avatar: firebaseUser.photoURL || '',
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  /** Resolves false when the user simply closed the popup; throws on real failures. */
  const signIn = async (): Promise<boolean> => {
    if (isIosStandalone()) {
      await signInWithRedirect(auth, googleProvider);   // navigates away; never resolves meaningfully
      return false;
    }
    try {
      await signInWithPopup(auth, googleProvider);
      return true;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return false;
      if (code && POPUP_UNSUPPORTED.has(code)) {
        await signInWithRedirect(auth, googleProvider);
        return false;
      }
      console.error('Sign in error:', err);
      throw err;
    }
  };

  const signOut = () => firebaseSignOut(auth);

  /**
   * Deleting an account needs a recent sign-in. Call this *before* deleting any data: it asks
   * Google again (pop-up) when the last sign-in is older than a few minutes. Resolves 'resign'
   * where a pop-up isn't possible (iOS home-screen app): the user must sign out and in again.
   */
  const confirmRecentSignIn = async (): Promise<'ok' | 'resign'> => {
    const current = auth.currentUser;
    if (!current) throw new Error('Not signed in');
    const last = Date.parse(current.metadata.lastSignInTime ?? '');
    if (Number.isFinite(last) && Date.now() - last < 4 * 60_000) return 'ok';
    if (isIosStandalone()) return 'resign';
    await reauthenticateWithPopup(current, googleProvider);
    return 'ok';
  };

  /** Deletes the sign-in record (name, email, photo link) from Firebase Authentication. */
  const deleteAccount = async (): Promise<void> => {
    const current = auth.currentUser;
    if (!current) throw new Error('Not signed in');
    await deleteUser(current);
  };

  return { user, loading, signIn, signOut, confirmRecentSignIn, deleteAccount };
}
