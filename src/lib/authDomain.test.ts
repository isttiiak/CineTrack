import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseAuthDomain } from './authDomain';
import { markSignInPending, takeSignInPending } from './signInFlag';

describe('chooseAuthDomain', () => {
  const base = { configured: 'proj.firebaseapp.com', host: 'cine-track-silk.vercel.app' };
  it('uses the app\'s own domain only for the iOS home-screen app on a deployment that enabled it', () => {
    expect(chooseAuthDomain({ ...base, proxyEnabled: true, iosStandalone: true })).toBe('cine-track-silk.vercel.app');
  });
  it('leaves every other browser on the configured domain', () => {
    expect(chooseAuthDomain({ ...base, proxyEnabled: true, iosStandalone: false })).toBe('proj.firebaseapp.com');   // Safari tab, desktop, Android
    expect(chooseAuthDomain({ ...base, proxyEnabled: false, iosStandalone: true })).toBe('proj.firebaseapp.com');   // a fork without the rewrite
    expect(chooseAuthDomain({ ...base, proxyEnabled: false, iosStandalone: false })).toBe('proj.firebaseapp.com');
  });
  it('never returns an empty host', () => {
    expect(chooseAuthDomain({ ...base, host: '', proxyEnabled: true, iosStandalone: true })).toBe('proj.firebaseapp.com');
    expect(chooseAuthDomain({ configured: undefined, host: '', proxyEnabled: true, iosStandalone: true })).toBeUndefined();
  });
});

describe('sign-in pending flag', () => {
  const store = new Map<string, string>();
  beforeEach(() => vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } }));
  afterEach(() => { store.clear(); vi.unstubAllGlobals(); });

  it('reports a recent start once, then forgets it', () => {
    markSignInPending(1_000_000);
    expect(takeSignInPending(1_000_000 + 60_000)).toBe(true);
    expect(takeSignInPending(1_000_000 + 60_000)).toBe(false);
  });
  it('ignores an old mark (someone just opening the app much later) and clears it', () => {
    markSignInPending(1_000_000);
    expect(takeSignInPending(1_000_000 + 16 * 60_000)).toBe(false);
    expect(store.has('cinetrack_signin_pending')).toBe(false);
  });
  it('is false when nothing was started', () => {
    expect(takeSignInPending()).toBe(false);
  });
  it('stays under the cinetrack_ prefix, so "Erase everything" removes it', () => {
    markSignInPending();
    for (const k of store.keys()) expect(k.startsWith('cinetrack_')).toBe(true);
  });
});
