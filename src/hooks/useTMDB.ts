import { useCallback } from 'react';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w92';

export function useTMDB() {
  const fetchPoster = useCallback(async (title: string, year: string, type: 'Film' | 'Series'): Promise<string | null> => {
    if (!API_KEY) return null;
    try {
      const endpoint = type === 'Series' ? 'search/tv' : 'search/movie';
      const yearParam = year ? (type === 'Series' ? `&first_air_date_year=${year}` : `&year=${year}`) : '';
      const url = `${BASE_URL}/${endpoint}?query=${encodeURIComponent(title)}${yearParam}&api_key=${API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      const posterPath = data.results?.[0]?.poster_path;
      return posterPath ? `${IMG_BASE}${posterPath}` : null;
    } catch {
      return null;
    }
  }, []);

  return { fetchPoster };
}
