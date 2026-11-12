import { useEffect, useState } from 'react';
import { tmdb } from '../lib/tmdb';
import type { TMDBItem } from './useTMDBDiscover';

/** TMDB matches for what the user is typing in the Add form (debounced, top 6 films/series). */
export function useTitleSuggestions(query: string, enabled: boolean) {
  const [items, setItems] = useState<TMDBItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < 2) { setItems([]); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      tmdb<{ results?: TMDBItem[] }>('search/multi', { query: q, language: 'en-US' }, controller.signal)
        .then((d) => {
          setItems((d.results ?? []).filter((r) => (r.media_type === 'movie' || r.media_type === 'tv') && (r.title || r.name)).slice(0, 6));
          setLoading(false);
        })
        .catch((err) => { if (err?.name !== 'AbortError') { setItems([]); setLoading(false); } });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, enabled]);

  return { items, loading };
}
