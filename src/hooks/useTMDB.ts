import { useCallback } from 'react';
import type { MediaType } from '../types';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w185';

// One lookup per title per session, shared across every row/card that renders it — including
// misses, so titles TMDB doesn't know aren't re-queried on every re-mount.
const cache = new Map<string, Promise<string | null>>();

async function lookup(title: string, year: string, type: MediaType): Promise<string | null> {
  if (!API_KEY) return null;
  const endpoint = type === 'Series' ? 'search/tv' : 'search/movie';
  const params = new URLSearchParams({ query: title, api_key: API_KEY });
  const y = year.slice(0, 4);
  if (/^\d{4}$/.test(y)) params.set(type === 'Series' ? 'first_air_date_year' : 'year', y);
  const res = await fetch(`${BASE_URL}/${endpoint}?${params}`);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  const posterPath = data.results?.[0]?.poster_path;
  return typeof posterPath === 'string' ? `${IMG_BASE}${posterPath}` : null;
}

/** Re-sizes a TMDB poster URL (e.g. w92 → w342) for larger renders. Non-TMDB URLs pass through. */
export function posterAt(url: string | undefined, size: 'w92' | 'w185' | 'w342' | 'w500'): string | undefined {
  return url?.replace(/(image\.tmdb\.org\/t\/p\/)w\d+/, `$1${size}`);
}

export function useTMDB() {
  const fetchPoster = useCallback((title: string, year: string, type: MediaType): Promise<string | null> => {
    const key = `${type}|${title.toLowerCase()}|${year}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = lookup(title, year, type).catch(() => { cache.delete(key); return null; });
      cache.set(key, pending);
    }
    return pending;
  }, []);

  return { fetchPoster };
}
