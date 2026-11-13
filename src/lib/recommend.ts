import type { MovieEntry, WatchMeta } from '../types';
import type { TMDBItem } from '../hooks/useTMDBDiscover';
import { findDuplicate } from './duplicates';
import { isUnreleased } from './discoverFeeds';
import { TMDB_GENRES } from './titleData';

/**
 * "For you": recommendations built from what you've actually watched and rated.
 *
 *  1. Seeds: the titles that best show your taste, each with a weight (a 10/10 counts far more than
 *     a "watched, unrated"). Titles you rated 4 or lower are never seeds and count against their genres.
 *  2. Candidates: TMDB's "people who liked this also liked" lists for each seed.
 *  3. Scoring: a candidate recommended by several of your favourites ranks higher; so do well-reviewed
 *     titles (vote counts are damped so a 9.0 from 12 votes can't win) and genres you tend to rate highly.
 *  4. Filters: no posters-less/obscure/poorly-rated titles, nothing already in your list.
 *  5. Variety: one seed can't fill the whole page.
 */

export interface Seed { entry: MovieEntry; weight: number }
export interface Recommendation { item: TMDBItem; because: string; score: number }

/** How strongly a title signals taste: positive = liked, negative = disliked, null = no signal. */
export function seedWeight(m: WatchMeta | undefined): number | null {
  if (!m) return null;
  const r = m.personalRating;
  if (r != null) {
    if (r >= 9) return 3;
    if (r >= 8) return 2.2;
    if (r >= 7) return 1.5;
    if (r >= 6) return 0.6;
    if (r > 4) return 0;          // lukewarm: tells us nothing either way
    return -1.5;                  // disliked
  }
  if (m.status === 'watched') return 1;
  if (m.status === 'watching') return 0.8;
  return null;                    // only planned: no taste signal yet
}

/** The strongest taste signals first; ties go to what you watched most recently. */
export function pickSeeds(entries: MovieEntry[], meta: Record<string, WatchMeta>, max = 8): Seed[] {
  return entries
    .map((entry, i) => ({ entry, weight: seedWeight(meta[entry.id]) ?? 0, recency: meta[entry.id]?.watchedOn ?? '', i }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight || b.recency.localeCompare(a.recency) || b.i - a.i)
    .slice(0, max)
    .map(({ entry, weight }) => ({ entry, weight }));
}

/** "Action & Adventure" → ["action", "adventure"]; "Science Fiction" and "Sci-Fi" are the same thing. */
export function genreTokens(genre: string): string[] {
  const tokens = genre.split(',').flatMap((g) => g.split('&')).map((g) => g.trim().toLowerCase())
    .map((g) => (g === 'science fiction' ? 'sci-fi' : g))
    .filter(Boolean);
  return [...new Set(tokens)];
}

/** Genre → how much you like it, from -1 to 1, based on the weights of the titles you've seen. */
export function tasteProfile(entries: MovieEntry[], meta: Record<string, WatchMeta>): Map<string, number> {
  const sums = new Map<string, number>();
  for (const e of entries) {
    const w = seedWeight(meta[e.id]);
    if (!w) continue;
    for (const g of genreTokens(e.genre)) sums.set(g, (sums.get(g) ?? 0) + w);
  }
  const peak = Math.max(0, ...[...sums.values()].map(Math.abs));
  return new Map([...sums].map(([g, v]) => [g, peak ? v / peak : 0]));
}

const candidateGenres = (item: TMDBItem) => genreTokens((item.genre_ids ?? []).map((id) => TMDB_GENRES[id]).filter(Boolean).join(', '));

/** Reviews, damped by how many there are (a Bayesian average), mapped to roughly 0–1. */
export function quality(item: Pick<TMDBItem, 'vote_average' | 'vote_count'>): number {
  const votes = item.vote_count ?? 0;
  const bayes = (votes * (item.vote_average ?? 0) + 300 * 6.5) / (votes + 300);
  return Math.min(1.2, Math.max(0, (bayes - 6) / 2.5));
}

const verb = (weight: number) => (weight >= 1.5 ? 'liked' : 'watched');
const joinTitles = (t: string[]) => (t.length > 1 ? `${t[0]} and ${t[1]}` : t[0]);

export function rankRecommendations(input: {
  lists: { seed: Seed; results: TMDBItem[] }[];
  entries: MovieEntry[];
  profile: Map<string, number>;
  today?: string;
  limit?: number;
  maxPerSeed?: number;
}): Recommendation[] {
  const { lists, entries, profile, today, limit = 40, maxPerSeed = 7 } = input;
  // movie and TV ids overlap, so the type is part of the key
  const listedIds = new Set(entries.filter((e) => e.tmdbId).map((e) => `${e.type === 'Series' ? 'tv' : 'movie'}-${e.tmdbId}`));

  const pool = new Map<string, { item: TMDBItem; affinity: number; contributions: { title: string; weight: number; value: number }[] }>();
  for (const { seed, results } of lists) {
    results.forEach((item, rank) => {
      if (!item.poster_path || !(item.title || item.name)) return;
      const key = `${item.media_type}-${item.id}`;
      const value = seed.weight / (1 + rank / 6);          // the closer to the top of a seed's list, the stronger
      const cur = pool.get(key) ?? { item, affinity: 0, contributions: [] };
      cur.affinity += value;
      cur.contributions.push({ title: seed.entry.title, weight: seed.weight, value });
      pool.set(key, cur);
    });
  }

  const scored: (Recommendation & { primary: string })[] = [];
  for (const [key, { item, affinity, contributions }] of pool) {
    if (listedIds.has(key)) continue;
    const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4);
    if (findDuplicate(entries, { title: item.title ?? item.name ?? '', year, type: item.media_type === 'tv' ? 'Series' : 'Film', imdbUrl: '', tmdbId: item.id })) continue;

    const unreleased = isUnreleased(item, today);
    const votes = item.vote_count ?? 0;
    // Obscure or poorly reviewed titles don't belong in a list of picks "for you".
    if (!unreleased && (votes < 25 || (votes >= 50 && (item.vote_average ?? 0) < 6))) continue;

    const q = unreleased ? 0.5 : quality(item);
    const tokens = candidateGenres(item);
    const genreFit = tokens.length ? tokens.reduce((s, t) => s + (profile.get(t) ?? 0), 0) / tokens.length : 0;
    const score = affinity * (1 + 0.6 * q) + 0.8 * genreFit + 0.15 * Math.log10(1 + (item.popularity ?? 0));

    const top = [...contributions].sort((a, b) => b.value - a.value);
    const titles = [...new Set(top.map((c) => c.title))].slice(0, 2);
    scored.push({ item, score, because: `Because you ${verb(top[0].weight)} ${joinTitles(titles)}`, primary: top[0].title });
  }
  scored.sort((a, b) => b.score - a.score);

  // Variety: no single seed fills more than `maxPerSeed` of the list; overflow only fills spare room.
  const perSeed = new Map<string, number>();
  const picked: typeof scored = [];
  const overflow: typeof scored = [];
  for (const r of scored) {
    const n = perSeed.get(r.primary) ?? 0;
    if (n < maxPerSeed) { picked.push(r); perSeed.set(r.primary, n + 1); } else overflow.push(r);
  }
  return [...picked, ...overflow].slice(0, limit).map(({ item, because, score }) => ({ item, because, score }));
}
