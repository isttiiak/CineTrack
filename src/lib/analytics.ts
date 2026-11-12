import type { Analytics } from 'firebase/analytics';
import { app } from './firebase';

/**
 * Firebase Analytics, loaded lazily and only when:
 *  - a measurement id is configured (forks without one send nothing), and
 *  - the browser doesn't signal Do Not Track / Global Privacy Control.
 * Event params never include titles, notes, links or other personal data.
 */
let instance: Promise<{ analytics: Analytics; logEvent: typeof import('firebase/analytics').logEvent } | null> | null = null;

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

function load() {
  instance ??= (async () => {
    if (!import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || optedOut()) return null;
    const { getAnalytics, isSupported, logEvent } = await import('firebase/analytics');
    if (!(await isSupported())) return null;
    return { analytics: getAnalytics(app), logEvent };
  })().catch(() => null);
  return instance;
}

export type AnalyticsEvent =
  | 'watchlist_entry_added' | 'watchlist_entry_deleted' | 'watchlist_entry_edited'
  | 'status_changed' | 'personal_rating_set' | 'notes_saved' | 'platform_set'
  | 'sign_in' | 'sign_out' | 'theme_toggled' | 'section_reordered'
  | 'export_json' | 'import_json';

export function track(event: AnalyticsEvent, params?: Record<string, string | number>): void {
  void load().then((a) => { if (a) a.logEvent(a.analytics, event, params); });
}
