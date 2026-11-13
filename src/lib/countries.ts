import type { MovieEntry } from '../types';

/**
 * Country handling for the filter, search and analytics.
 *
 * `MovieEntry.country` is free text: TMDB fills it ("USA", "South Korea"), co-productions are
 * joined ("USA/Japan"), and entries typed by hand or imported can say "United States" or "UK".
 * These helpers split that into individual countries and fold the common spellings together, so
 * the filter shows one "USA" instead of three.
 */

const ALIASES: Record<string, string> = {
  'us': 'USA', 'u.s.': 'USA', 'u.s.a.': 'USA', 'usa': 'USA', 'america': 'USA',
  'united states': 'USA', 'united states of america': 'USA',
  'uk': 'UK', 'u.k.': 'UK', 'gb': 'UK', 'britain': 'UK', 'great britain': 'UK', 'united kingdom': 'UK', 'england': 'UK',
  'korea': 'South Korea', 's. korea': 'South Korea', 'republic of korea': 'South Korea', 'south korea': 'South Korea',
  'russian federation': 'Russia',
  'people\'s republic of china': 'China', 'prc': 'China',
  'hong kong sar china': 'Hong Kong',
  'the netherlands': 'Netherlands', 'holland': 'Netherlands',
  'czechia': 'Czech Republic',
};

/** "united states" → "USA", "Japan" → "Japan" (unknown names are kept as written). */
export function canonicalCountry(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

/** The individual countries of an entry, canonical and without duplicates. */
export function countriesOf(entry: Pick<MovieEntry, 'country'>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (entry.country ?? '').split(/[/,;]/)) {
    if (!part.trim()) continue;
    const c = canonicalCountry(part);
    if (!seen.has(c.toLowerCase())) { seen.add(c.toLowerCase()); out.push(c); }
  }
  return out;
}

/** Does this entry belong to `country`? Exact country name (after folding spellings). */
export function hasCountry(entry: Pick<MovieEntry, 'country'>, country: string): boolean {
  const wanted = canonicalCountry(country).toLowerCase();
  return countriesOf(entry).some((c) => c.toLowerCase() === wanted);
}

/** Looser match for typed search ("korea" finds "South Korea", "us" finds "USA"). */
export function matchesCountryText(entry: Pick<MovieEntry, 'country'>, text: string): boolean {
  const wanted = canonicalCountry(text).toLowerCase();
  if (!wanted) return false;
  return countriesOf(entry).some((c) => {
    const n = c.toLowerCase();
    return n === wanted || (wanted.length >= 3 && n.includes(wanted));
  });
}

export interface CountryOption { name: string; count: number }

/** Every country in the list with how many titles it has, most titles first. */
export function countryOptions(entries: Pick<MovieEntry, 'country'>[]): CountryOption[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const e of entries) {
    for (const c of countriesOf(e)) {
      const key = c.toLowerCase();
      const cur = counts.get(key);
      if (cur) cur.count++; else counts.set(key, { name: c, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
