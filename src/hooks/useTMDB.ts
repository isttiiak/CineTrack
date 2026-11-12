import { useCallback } from 'react';
import type { MediaType } from '../types';
import { tmdb } from '../lib/tmdb';
import { normalizeTitle } from '../lib/duplicates';

const IMG_BASE = 'https://image.tmdb.org/t/p/w185';

interface SearchResult { poster_path?: string | null; title?: string; name?: string; original_title?: string; original_name?: string }

// One lookup per title per session, shared across every row/card that renders it — including
// misses, so titles TMDB doesn't know aren't re-queried on every re-mount.
const cache = new Map<string, Promise<string | null>>();

const toUrl = (path: unknown) => (typeof path === 'string' && path ? `${IMG_BASE}${path}` : null);

async function lookup(title: string, year: string, type: MediaType, tmdbId?: number): Promise<string | null> {
  const kind = type === 'Series' ? 'tv' : 'movie';

  // A known TMDB id identifies the exact title; no guessing from search results.
  if (tmdbId) {
    const details = await tmdb<SearchResult>(`${kind}/${tmdbId}`);
    return toUrl(details.poster_path);
  }

  const params: Record<string, string> = { query: title };
  const y = year.slice(0, 4);
  if (/^\d{4}$/.test(y)) params[kind === 'tv' ? 'first_air_date_year' : 'year'] = y;
  const data = await tmdb<{ results?: SearchResult[] }>(`search/${kind}`, params);
  const results = (data.results ?? []).filter((r) => r.poster_path);
  // Prefer an exact title match over TMDB's popularity ranking ("Dune" shouldn't get "Dune: Part Two").
  const wanted = normalizeTitle(title);
  const exact = results.find((r) =>
    [r.title, r.name, r.original_title, r.original_name].some((t) => t && normalizeTitle(t) === wanted));
  return toUrl((exact ?? results[0])?.poster_path);
}

/** Re-sizes a TMDB poster URL (e.g. w92 → w342) for larger renders. Non-TMDB URLs pass through. */
export function posterAt(url: string | undefined, size: 'w92' | 'w185' | 'w342' | 'w500'): string | undefined {
  return url?.replace(/(image\.tmdb\.org\/t\/p\/)w\d+/, `$1${size}`);
}

export function useTMDB() {
  const fetchPoster = useCallback((title: string, year: string, type: MediaType, tmdbId?: number): Promise<string | null> => {
    const key = tmdbId ? `${type}|#${tmdbId}` : `${type}|${title.toLowerCase()}|${year}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = lookup(title, year, type, tmdbId).catch(() => { cache.delete(key); return null; });
      cache.set(key, pending);
    }
    return pending;
  }, []);

  return { fetchPoster };
}
