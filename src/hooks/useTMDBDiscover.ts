import { useState, useEffect } from 'react';

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

export type DiscoverTab = 'trending' | 'movies' | 'tv';

export function useTMDBDiscover(tab: DiscoverTab) {
  const [items, setItems] = useState<TMDBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!TMDB_KEY) { setLoading(false); setError(true); return; }
    setLoading(true);
    setError(false);

    const endpoints: Record<DiscoverTab, string> = {
      trending: `${BASE}/trending/all/week?api_key=${TMDB_KEY}&language=en-US`,
      movies: `${BASE}/movie/popular?api_key=${TMDB_KEY}&language=en-US`,
      tv: `${BASE}/tv/popular?api_key=${TMDB_KEY}&language=en-US`,
    };

    fetch(endpoints[tab])
      .then(r => {
        if (!r.ok) throw new Error('TMDB fetch failed');
        return r.json();
      })
      .then(data => {
        const results: TMDBItem[] = (data.results || []).map((item: TMDBItem) => ({
          ...item,
          media_type: item.media_type ?? (tab === 'movies' ? 'movie' : 'tv'),
        }));
        setItems(results);
        setLoading(false);
      })
      .catch(() => { setLoading(false); setError(true); });
  }, [tab]);

  return { items, loading, error };
}
