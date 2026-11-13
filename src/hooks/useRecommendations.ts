import { useEffect, useMemo, useState } from 'react';
import type { MovieEntry, WatchMeta } from '../types';
import { tmdb } from '../lib/tmdb';
import { kindOf, resolveTmdbId } from '../lib/titleData';
import { pickSeeds, rankRecommendations, tasteProfile, type Recommendation } from '../lib/recommend';
import type { TMDBItem } from './useTMDBDiscover';

export type { Recommendation };

const MAX_SEEDS = 8;

/**
 * "For you": see lib/recommend.ts. Seeds are picked from what you've watched and rated; seeds
 * without a TMDB id (starter titles, hand-typed ones) get one looked up first, so they count too.
 */
export function useRecommendations(entries: MovieEntry[], meta: Record<string, WatchMeta>, enabled: boolean) {
  const seeds = useMemo(() => pickSeeds(entries, meta, MAX_SEEDS), [entries, meta]);
  const seedKey = seeds.map((s) => `${s.entry.id}:${s.weight}`).join(',');
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || seeds.length === 0) { setRecs([]); return; }
    let active = true;
    setLoading(true);
    (async () => {
      const lists = await Promise.all(seeds.map(async (seed) => {
        const id = await resolveTmdbId(seed.entry);
        if (!id) return { seed, results: [] as TMDBItem[] };
        const kind = kindOf(seed.entry.type);
        const data = await tmdb<{ results?: TMDBItem[] }>(`${kind}/${id}/recommendations`, { language: 'en-US' }).catch(() => ({ results: [] as TMDBItem[] }));
        return { seed, results: (data.results ?? []).map((item) => ({ ...item, media_type: kind }) as TMDBItem) };
      }));
      if (!active) return;
      setRecs(rankRecommendations({ lists, entries, profile: tasteProfile(entries, meta) }));
      setLoading(false);
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, seedKey]);

  return { recs, loading, hasSeeds: seeds.length > 0, seedTitles: seeds.map((s) => s.entry.title) };
}
