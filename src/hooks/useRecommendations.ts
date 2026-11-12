import { useEffect, useMemo, useState } from 'react';
import type { MovieEntry, WatchMeta } from '../types';
import { tmdb } from '../lib/tmdb';
import { kindOf } from '../lib/titleData';
import type { TMDBItem } from './useTMDBDiscover';

export interface Recommendation { item: TMDBItem; because: string }

const MAX_SEEDS = 4;

/**
 * "Because you liked X": TMDB recommendations for the user's best-rated titles (or, without
 * ratings, the most recently watched), merged, de-duplicated and minus anything already listed.
 */
export function useRecommendations(entries: MovieEntry[], meta: Record<string, WatchMeta>, enabled: boolean) {
  const seeds = useMemo(() => {
    const withId = entries.filter((e) => e.tmdbId);
    const rated = withId
      .filter((e) => (meta[e.id]?.personalRating ?? 0) >= 7)
      .sort((a, b) => (meta[b.id]?.personalRating ?? 0) - (meta[a.id]?.personalRating ?? 0));
    const watched = withId.filter((e) => meta[e.id]?.status === 'watched' && !rated.includes(e)).reverse();
    return [...rated, ...watched].slice(0, MAX_SEEDS);
  }, [entries, meta]);

  const seedKey = seeds.map((s) => s.tmdbId).join(',');
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || seeds.length === 0) { setRecs([]); return; }
    let active = true;
    setLoading(true);
    Promise.all(seeds.map((s) =>
      tmdb<{ results?: TMDBItem[] }>(`${kindOf(s.type)}/${s.tmdbId}/recommendations`, { language: 'en-US' })
        .then((d) => (d.results ?? []).map((item) => ({ item: { ...item, media_type: kindOf(s.type) } as TMDBItem, because: s.title })))
        .catch(() => [] as Recommendation[]),
    )).then((lists) => {
      if (!active) return;
      const listed = new Set(entries.map((e) => e.tmdbId).filter(Boolean));
      const seen = new Set<number>();
      // Interleave the lists so every seed is represented near the top.
      const out: Recommendation[] = [];
      for (let i = 0; i < 20; i++) {
        for (const list of lists) {
          const r = list[i];
          if (!r || listed.has(r.item.id) || seen.has(r.item.id) || !r.item.poster_path) continue;
          seen.add(r.item.id);
          out.push(r);
        }
      }
      setRecs(out.slice(0, 40));
      setLoading(false);
    });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, seedKey]);

  return { recs, loading, hasSeeds: seeds.length > 0 };
}
