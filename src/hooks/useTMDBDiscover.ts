import { useState, useEffect, useRef } from 'react';
import { tmdb, TMDB_IMG } from '../lib/tmdb';

export { TMDB_IMG };

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
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details = await tmdb<any>(`${mediaType}/${id}`, { language: 'en-US', append_to_response: 'external_ids' });
    const extIds = details.external_ids ?? {};

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
      // TMDB deprecated episode_run_time; fall back chain: runtime → episode_run_time[0] → latest episode.
      const rt = details.runtime ?? details.episode_run_time?.[0] ?? details.last_episode_to_air?.runtime ?? 0;
      // The episode count lets stats total a whole series instead of counting a single episode.
      const eps = details.number_of_episodes ?? 0;
      if (rt > 0) duration = eps > 0 ? `${rt} min/ep · ${eps} eps` : `${rt} min/ep`;
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
    // Ignore responses from superseded queries so a slow older search can't overwrite newer results.
    const controller = new AbortController();

    const doFetch = () => {
      setLoading(true);
      setError(false);

      const trimmed = searchQuery.trim();
      const path = trimmed.length > 1
        ? 'search/multi'
        : ({ trending: 'trending/all/week', movies: 'movie/popular', tv: 'tv/popular' } as Record<DiscoverTab, string>)[tab];
      const params: Record<string, string> = { language: 'en-US' };
      if (trimmed.length > 1) params.query = trimmed;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tmdb<any>(path, params, controller.signal)
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
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setLoading(false); setError(true);
        });
    };

    const q = searchQuery.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = q.length > 1
      ? setTimeout(doFetch, 350)
      : (doFetch(), null);

    return () => {
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [tab, searchQuery]);

  return { items, loading, error };
}
