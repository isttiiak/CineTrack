import { useSyncExternalStore } from 'react';

/**
 * Consent for anonymous usage statistics.
 *  - Where consent is required (EU/EEA, UK, Switzerland) nothing is collected until the visitor
 *    says yes. Everywhere else it is on by default with an opt-out in Settings → Privacy.
 *  - "Where" comes from /api/region (the host's IP-derived country header); if that can't be
 *    reached we guess from the browser time zone, and until we know at all we collect nothing.
 *  - The single stored value is the visitor's choice ('on' | 'off'); Settings changes the same value.
 */

const CHOICE_KEY = 'cinetrack_analytics';     // 'on' | 'off'  (key kept from the old opt-out switch)
const REGION_KEY = 'cinetrack_region';        // last answer from /api/region: '1' (required) | '0'

export type Requirement = 'required' | 'not_required' | 'pending';

let sessionRequired: boolean | null = null;   // this session's answer (authoritative once set)
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((l) => l()); };

/**
 * Time zones that suggest the EU/EEA/UK/Switzerland. Only a fallback for when the server can't
 * tell. It errs on the side of asking: a needless banner in, say, Istanbul costs nothing.
 */
export function timeZoneSuggestsConsentRegion(tz: string): boolean {
  return /^Europe\//.test(tz) || /^Atlantic\/(Canary|Madeira|Azores|Reykjavik|Faroe)$/.test(tz);
}

function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; } catch { return ''; }
}

function readCachedRegion(): boolean | null {
  try {
    const v = localStorage.getItem(REGION_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }
}

export function consentRequirement(): Requirement {
  const known = sessionRequired ?? readCachedRegion();
  if (known === null) return 'pending';
  return known ? 'required' : 'not_required';
}

/** Asks the server where the visitor is. Safe to call more than once; never throws. */
export async function detectConsentRegion(): Promise<void> {
  let required: boolean | null = null;
  try {
    const res = await fetch('/api/region', { cache: 'no-store' });
    if (res.ok) {
      const body = (await res.json()) as { consentRequired?: boolean | null };
      if (typeof body.consentRequired === 'boolean') required = body.consentRequired;
    }
  } catch { /* offline or no such endpoint (local dev, a fork): fall back below */ }
  // Best answer first: the server now, else the last answer it gave this browser, else the time zone.
  sessionRequired = required ?? readCachedRegion() ?? timeZoneSuggestsConsentRegion(browserTimeZone());
  if (required !== null) { try { localStorage.setItem(REGION_KEY, required ? '1' : '0'); } catch { /* private mode */ } }
  emit();
}

/** The visitor's stored choice, or null when they haven't made one. */
export function consentChoice(): 'on' | 'off' | null {
  try {
    const v = localStorage.getItem(CHOICE_KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch { return null; }
}

export function setConsentChoice(on: boolean): void {
  try { localStorage.setItem(CHOICE_KEY, on ? 'on' : 'off'); } catch { /* private mode: applies to this session only */ }
  emit();
}

/** Effective on/off for analytics: the explicit choice, else the regional default. */
export function analyticsOn(): boolean {
  const choice = consentChoice();
  if (choice) return choice === 'on';
  return consentRequirement() === 'not_required';
}

/** True when the visitor is in a consent region and hasn't answered yet. */
export function awaitingConsent(): boolean {
  return consentChoice() === null && consentRequirement() === 'required';
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** Re-renders when the region answer or the choice changes. */
export function useConsentVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}
