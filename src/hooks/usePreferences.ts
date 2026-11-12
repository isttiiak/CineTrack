import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

/** Per-device display preferences (not synced — a phone and a laptop may want different layouts). */
export interface Preferences {
  groupBySection: boolean;    // show section headers/dividers on the watchlist
  showSectionTag: boolean;    // small section tag on each card/row
  showCardDetails: boolean;   // runtime + notes indicators on cards/rows
  cursorGlow: boolean;        // mouse spotlight background effect
  region: string;             // ISO country for "where to watch"; '' = from the browser locale
  myServices: string[];       // streaming platforms the user has (highlighted, used to pre-fill Platform)
}

export const DEFAULT_PREFERENCES: Preferences = {
  groupBySection: false,
  showSectionTag: true,
  showCardDetails: true,
  cursorGlow: true,
  region: '',
  myServices: [],
};

export function usePreferences() {
  const [stored, setStored] = useLocalStorage<Partial<Preferences>>('cinetrack_prefs', {});
  // Merge with defaults so preferences added in later versions get sensible values.
  const prefs: Preferences = { ...DEFAULT_PREFERENCES, ...(stored && typeof stored === 'object' ? stored : {}) };

  const setPref = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setStored((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), [key]: value }));
  }, [setStored]);

  return { prefs, setPref };
}
