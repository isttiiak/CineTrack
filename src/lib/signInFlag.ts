/**
 * Remembers that a redirect sign-in was started, so that coming back without a result (the browser
 * dropped it, or the user backed out at Google) can be told to the user instead of failing silently.
 * Kept in localStorage: the page is replaced by the redirect, so memory and sessionStorage don't survive it.
 */
const KEY = 'cinetrack_signin_pending';
const TTL_MS = 15 * 60_000;

export function markSignInPending(now = Date.now()): void {
  try { localStorage.setItem(KEY, String(now)); } catch { /* private mode: no message later, nothing worse */ }
}

/** True when a sign-in was started in the last 15 minutes. Clears the mark either way. */
export function takeSignInPending(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(KEY));
    localStorage.removeItem(KEY);
    return Number.isFinite(at) && at > 0 && now - at < TTL_MS;
  } catch { return false; }
}
