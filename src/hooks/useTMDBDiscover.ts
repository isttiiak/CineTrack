import { useState, useEffect, useRef } from 'react';

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';

export interface TMDBItem {
  id: number;
  title?: string;
  name?: string;
  media_type: 'movie' | 'tv';
  poster_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  genre_ids: number[];
  original_language: string;
}

export interface TMDBDetails {
  country: string;
  imdbUrl: string;
  duration: string;
}

export type DiscoverTab = 'trending' | 'movies' | 'tv';

const COUNTRY_CODES: Record<string, string> = {
  US: 'USA', GB: 'UK', FR: 'France', DE: 'Germany', JP: 'Japan',
  KR: 'South Korea', IN: 'India', IT: 'Italy', ES: 'Spain', CN: 'China',
  AU: 'Australia', CA: 'Canada', BR: 'Brazil', MX: 'Mexico', SE: 'Sweden',
  DK: 'Denmark', NO: 'Norway', FI: 'Finland', NL: 'Netherlands', BE: 'Belgium',
  PL: 'Poland', RU: 'Russia', TR: 'Turkey', TH: 'Thailand', HK: 'Hong Kong',
  TW: 'Taiwan', AR: 'Argentina', CO: 'Colombia', PT: 'Portugal', AT: 'Austria',
};

export async function fetchTMDBDetails(id: number, mediaType: 'movie' | 'tv'): Promise<TMDBDetails> {
  if (!TMDB_KEY) return { country: '', imdbUrl: '', duration: '' };
  try {
    const [details, extIds] = await Promise.all([
      fetch(`${BASE}/${mediaType}/${id}?api_key=${TMDB_KEY}&language=en-US`).then(r => r.json()),
      fetch(`${BASE}/${mediaType}/${id}/external_ids?api_key=${TMDB_KEY}`).then(r => r.json()),
    ]);

    let country = '';
    if (mediaType === 'movie') {
      const code = details.production_countries?.[0]?.iso_3166_1 ?? '';
      country = COUNTRY_CODES[code] ?? details.production_countries?.[0]?.name ?? '';
    } else {
      const code = details.origin_country?.[0] ?? '';
      country = COUNTRY_CODES[code] ?? code;
    }

    const imdbUrl = extIds.imdb_id ? `https://www.imdb.com/title/${extIds.imdb_id}/` : '';

    let duration = '';
    if (mediaType === 'movie') {
      const rt = details.runtime ?? 0;
      if (rt > 0) {
        const h = Math.floor(rt / 60), m = rt % 60;
        duration = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
      }
    } else {
      // TMDB deprecated episode_run_time; fall back chain: runtime → episode_run_time[0]
      const rt = details.runtime ?? details.episode_run_time?.[0] ?? 0;
      if (rt > 0) duration = `${rt} min/ep`;
    }

    return { country, imdbUrl, duration };
  } catch {
    return { country: '', imdbUrl: '', duration: '' };
  }
}

export function useTMDBDiscover(tab: DiscoverTab, searchQuery: string) {
  const [items, setItems] = useState<TMDBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!TMDB_KEY) { setLoading(false); setError(true); return; }

    const doFetch = () => {
      setLoading(true);
      setError(false);

      const trimmed = searchQuery.trim();
      const url = trimmed.length > 1
        ? `${BASE}/search/multi?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(trimmed)}`
        : ({
            trending: `${BASE}/trending/all/week?api_key=${TMDB_KEY}&language=en-US`,
            movies:   `${BASE}/movie/popular?api_key=${TMDB_KEY}&language=en-US`,
            tv:       `${BASE}/tv/popular?api_key=${TMDB_KEY}&language=en-US`,
          } as Record<DiscoverTab, string>)[tab];

      fetch(url)
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results: TMDBItem[] = (data.results || [] as any[])
            .filter((item: { media_type?: string; title?: string; name?: string }) =>
              item.media_type !== 'person' && (item.title || item.name)
            )
            .map((item: { media_type?: string }) => ({
              ...item,
              media_type: (item.media_type === 'movie' || item.media_type === 'tv')
                ? item.media_type
                : (tab === 'movies' ? 'movie' : 'tv'),
            })) as TMDBItem[];
          setItems(results);
          setLoading(false);
        })
        .catch(() => { setLoading(false); setError(true); });
    };

    const q = searchQuery.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = q.length > 1
      ? setTimeout(doFetch, 350)
      : (doFetch(), null);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [tab, searchQuery]);

  return { items, loading, error };
}
