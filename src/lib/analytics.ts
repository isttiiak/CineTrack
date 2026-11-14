import type { Analytics } from 'firebase/analytics';
import { app } from './firebase';
import { analyticsOn, setConsentChoice } from './consent';

/**
 * Firebase Analytics, loaded lazily and only when:
 *  - a measurement id is configured (forks without one send nothing),
 *  - the browser doesn't signal Do Not Track / Global Privacy Control, and
 *  - the visitor allows it: opt-in where consent is required (EU/EEA, UK, Switzerland), opt-out
 *    everywhere else (lib/consent.ts; Settings → Privacy changes the same choice).
 * Event params never include titles, notes, links or other personal data (see PRIVACY.md).
 */
type Loaded = { analytics: Analytics; logEvent: typeof import('firebase/analytics').logEvent };
let instance: Promise<Loaded | null> | null = null;

/** True when this deployment has analytics configured at all. */
export const analyticsConfigured = !!import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;

/** Do Not Track / Global Privacy Control from the browser. */
export function browserOptedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

/** Whether the visitor currently allows usage statistics (their choice, else the regional default). */
export const analyticsPreference = analyticsOn;

const allowed = () => analyticsConfigured && !browserOptedOut() && analyticsOn();

function load() {
  if (!allowed()) return Promise.resolve(null);
  instance ??= (async () => {
    const { getAnalytics, isSupported, logEvent } = await import('firebase/analytics');
    if (!(await isSupported())) return null;
    return { analytics: getAnalytics(app), logEvent };
  })().catch(() => null);
  return instance;
}

/** Google Analytics keeps its identifier in `_ga*` cookies; remove them when collection stops. */
export function clearAnalyticsCookies() {
  const hosts = [location.hostname, `.${location.hostname}`, `.${location.hostname.split('.').slice(-2).join('.')}`];
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0].trim();
    if (!/^_ga(_|$)/.test(name) && name !== '_gid') continue;
    for (const domain of hosts) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

/** Turns anonymous usage statistics on or off. Takes effect immediately and is remembered. */
export function setAnalyticsEnabled(on: boolean): void {
  setConsentChoice(on);
  const pending = instance;
  if (!pending) return;                           // nothing started yet: the next event re-evaluates
  void pending.then(async (a) => {
    if (!a) return;
    const { setAnalyticsCollectionEnabled } = await import('firebase/analytics');
    setAnalyticsCollectionEnabled(a.analytics, on);
    if (!on) clearAnalyticsCookies();
  });
}

export type AnalyticsEvent =
  | 'watchlist_entry_added' | 'watchlist_entry_deleted' | 'watchlist_entry_edited'
  | 'status_changed' | 'personal_rating_set' | 'notes_saved' | 'platform_set'
  | 'sign_in' | 'sign_out' | 'section_reordered'
  | 'export_json' | 'import_json';

export function track(event: AnalyticsEvent, params?: Record<string, string | number>): void {
  if (!allowed()) return;
  void load().then((a) => { if (a) a.logEvent(a.analytics, event, params); });
}
