import type { Analytics } from 'firebase/analytics';
import { app } from './firebase';

/**
 * Firebase Analytics, loaded lazily and only when:
 *  - a measurement id is configured (forks without one send nothing),
 *  - the browser doesn't signal Do Not Track / Global Privacy Control, and
 *  - the user hasn't switched it off in Settings → Privacy.
 * Event params never include titles, notes, links or other personal data (see PRIVACY.md).
 */
type Loaded = { analytics: Analytics; logEvent: typeof import('firebase/analytics').logEvent };
let instance: Promise<Loaded | null> | null = null;

const PREF_KEY = 'cinetrack_analytics';   // 'off' when the user opted out

/** True when this deployment has analytics configured at all. */
export const analyticsConfigured = !!import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;

/** Do Not Track / Global Privacy Control from the browser. */
export function browserOptedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

/** The user's own choice (Settings → Privacy). On unless they switched it off. */
export function analyticsPreference(): boolean {
  try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch { return true; }
}

const allowed = () => analyticsConfigured && analyticsPreference() && !browserOptedOut();

function load() {
  instance ??= (async () => {
    if (!allowed()) return null;
    const { getAnalytics, isSupported, logEvent } = await import('firebase/analytics');
    if (!(await isSupported())) return null;
    return { analytics: getAnalytics(app), logEvent };
  })().catch(() => null);
  return instance;
}

/** Turns anonymous usage statistics on or off. Takes effect immediately and is remembered. */
export function setAnalyticsEnabled(on: boolean): void {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* private mode: applies to this session only */ }
  const pending = instance;
  if (on) { instance = null; return; }            // re-evaluated on the next event
  // Off: stop an already-started Analytics session from sending anything further.
  if (pending) {
    void pending.then(async (a) => {
      if (!a) return;
      const { setAnalyticsCollectionEnabled } = await import('firebase/analytics');
      setAnalyticsCollectionEnabled(a.analytics, false);
    });
  }
  instance = Promise.resolve(null);
}

export type AnalyticsEvent =
  | 'watchlist_entry_added' | 'watchlist_entry_deleted' | 'watchlist_entry_edited'
  | 'status_changed' | 'personal_rating_set' | 'notes_saved' | 'platform_set'
  | 'sign_in' | 'sign_out' | 'theme_toggled' | 'section_reordered'
  | 'export_json' | 'import_json';

export function track(event: AnalyticsEvent, params?: Record<string, string | number>): void {
  if (!allowed()) return;
  void load().then((a) => { if (a) a.logEvent(a.analytics, event, params); });
}
