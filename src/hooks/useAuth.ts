import { useState, useEffect } from 'react';
import { getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as firebaseSignOut } from 'firebase/auth';
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

  return { user, loading, signIn, signOut };
}
