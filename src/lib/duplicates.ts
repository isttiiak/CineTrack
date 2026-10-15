import type { MovieEntry } from '../types';

type Candidate = Pick<MovieEntry, 'title' | 'year' | 'type' | 'imdbUrl'> & { tmdbId?: number };

/** "Shōgun", "SHOGUN", "The Shogun!" → "shogun". */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')       // strip diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')      // punctuation → space
    .trim()
    .replace(/^(the|a|an) /, '');
}

export function imdbIdOf(url: string | undefined): string | null {
  return url?.match(/tt\d{5,}/)?.[0] ?? null;
}

/**
 * Two entries are the same title when they share an IMDb id, or a TMDB id of the same type, or a
 * normalised title + type with matching years. Different years (remakes, e.g. "Dune" 1984 vs 2021)
 * are NOT duplicates; a missing year on either side is treated as a match.
 */
export function isSameTitle(a: Candidate, b: Candidate): boolean {
  const imdbA = imdbIdOf(a.imdbUrl);
  const imdbB = imdbIdOf(b.imdbUrl);
  if (imdbA && imdbB) return imdbA === imdbB;
  if (a.tmdbId && b.tmdbId && a.type === b.type) return a.tmdbId === b.tmdbId;
  if (a.type !== b.type) return false;
  if (normalizeTitle(a.title) !== normalizeTitle(b.title)) return false;
  const yearA = a.year?.trim().slice(0, 4);
  const yearB = b.year?.trim().slice(0, 4);
  return !yearA || !yearB || yearA === yearB;
}

export function findDuplicate(entries: MovieEntry[], candidate: Candidate, excludeId?: string): MovieEntry | null {
  return entries.find((e) => e.id !== excludeId && isSameTitle(e, candidate)) ?? null;
}
