import type { MovieEntry } from '../types';
import { editDistance, typoBudget } from './search';

type Candidate = Pick<MovieEntry, 'title' | 'year' | 'type' | 'imdbUrl'> & { tmdbId?: number };

// "Part Two" = "Part 2" = "Part II". Roman numerals I, V and X are left alone ("V for Vendetta").
const NUMBER_WORDS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9',
};

/** "Shōgun", "SHOGUN", "The Shogun!" → "shogun"; "Dune: Part Two" → "dune part 2". */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')       // strip diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')      // punctuation → space
    .trim()
    .replace(/^(the|a|an) /, '')
    .split(' ').map((w) => NUMBER_WORDS[w] ?? w).join(' ');
}

export function imdbIdOf(url: string | undefined): string | null {
  return url?.match(/tt\d{5,}/)?.[0] ?? null;
}

const yearOf = (c: Candidate) => c.year?.trim().slice(0, 4) || '';
const yearsCompatible = (a: Candidate, b: Candidate) => !yearOf(a) || !yearOf(b) || yearOf(a) === yearOf(b);

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
  return yearsCompatible(a, b);
}

export function findDuplicate(entries: MovieEntry[], candidate: Candidate, excludeId?: string): MovieEntry | null {
  return entries.find((e) => e.id !== excludeId && isSameTitle(e, candidate)) ?? null;
}

export type DuplicateMatch = { entry: MovieEntry; kind: 'same' | 'similar' };

/**
 * For the Add form's warning: a definite duplicate ("same") or a probable one ("similar") — the
 * same title filed under the other type (the form defaults to Film), the same letters without
 * spaces ("Spiderman" / "Spider-Man"), or a title one or two typos away. Years must still agree,
 * so remakes aren't flagged.
 */
export function findSimilar(entries: MovieEntry[], candidate: Candidate, excludeId?: string): DuplicateMatch | null {
  const others = entries.filter((e) => e.id !== excludeId);
  const same = others.find((e) => isSameTitle(e, candidate));
  if (same) return { entry: same, kind: 'same' };

  const title = normalizeTitle(candidate.title);
  if (title.length < 2) return null;
  const compact = title.replace(/ /g, '');
  const budget = /\d/.test(compact) ? 0 : typoBudget(compact.length);
  const similar = others.find((e) => {
    if (!yearsCompatible(e, candidate)) return false;
    const other = normalizeTitle(e.title);
    const otherCompact = other.replace(/ /g, '');
    if (other === title || otherCompact === compact) return true;
    return budget > 0 && editDistance(compact, otherCompact, budget) <= budget;
  });
  return similar ? { entry: similar, kind: 'similar' } : null;
}
