import type { MediaType, MovieEntry, WatchPlatform } from '../types';
import { tmdb } from './tmdb';
import { imdbIdOf, normalizeTitle } from './duplicates';
import type { TMDBItem } from '../hooks/useTMDBDiscover';

export type TmdbKind = 'movie' | 'tv';
export const kindOf = (type: MediaType): TmdbKind => (type === 'Series' ? 'tv' : 'movie');

export const TMDB_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10765: 'Sci-Fi & Fantasy',
  10768: 'War & Politics',
};

// ── Details (one call: details + external ids + watch providers) ──────────────

export interface ProviderInfo { provider_id: number; provider_name: string; logo_path: string | null; display_priority?: number }
export interface RegionProviders { link?: string; flatrate?: ProviderInfo[]; free?: ProviderInfo[]; ads?: ProviderInfo[]; rent?: ProviderInfo[]; buy?: ProviderInfo[] }
export interface EpisodeRef { air_date: string | null; season_number: number; episode_number: number; name?: string }
export interface SeasonInfo { season_number: number; episode_count: number; name?: string; air_date?: string | null }

export interface TitleDetails {
  id: number;
  title?: string; name?: string;
  release_date?: string; first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  vote_average?: number;
  genres?: { id: number; name: string }[];
  status?: string;                          // e.g. "Returning Series", "Ended", "Released"
  number_of_episodes?: number;
  seasons?: SeasonInfo[];
  next_episode_to_air?: EpisodeRef | null;
  last_episode_to_air?: EpisodeRef | null;
  external_ids?: { imdb_id?: string | null };
  'watch/providers'?: { results?: Record<string, RegionProviders> };
}

const detailsCache = new Map<string, Promise<TitleDetails>>();

/** Cached per session; repeat calls for the same title share one request. */
export function getDetails(kind: TmdbKind, id: number): Promise<TitleDetails> {
  const key = `${kind}/${id}`;
  let p = detailsCache.get(key);
  if (!p) {
    p = tmdb<TitleDetails>(key, { language: 'en-US', append_to_response: 'external_ids,watch/providers' })
      .catch((err) => { detailsCache.delete(key); throw err; });
    detailsCache.set(key, p);
  }
  return p;
}

/** Regular seasons only (TMDB lists specials as season 0). */
export const regularSeasons = (d: TitleDetails) =>
  (d.seasons ?? []).filter((s) => s.season_number > 0 && s.episode_count > 0).sort((a, b) => a.season_number - b.season_number);

// ── Ratings from IMDb, Rotten Tomatoes, Metacritic, Letterboxd… (/api/ratings) ─

export interface Ratings {
  imdbId?: string;
  imdb?: number; imdbVotes?: number;
  rt?: number; rtAudience?: number;
  metacritic?: number;
  letterboxd?: number;
  tmdb?: number;
  trakt?: number;
}

const RATINGS_KEY = 'cinetrack_ratings_v1';
const RATINGS_TTL = 7 * 24 * 3600 * 1000;
const RATINGS_MAX = 600;
const ratingsMemory = new Map<string, Promise<Ratings | null>>();
let ratingsDisabled = false;   // set when the server has no ratings provider configured
let firstRatingsRequest: Promise<unknown> | null = null;

function readRatingsCache(): Record<string, { t: number; r: Ratings }> {
  try { return JSON.parse(localStorage.getItem(RATINGS_KEY) ?? '{}'); } catch { return {}; }
}
function writeRatingsCache(key: string, r: Ratings) {
  try {
    const all = readRatingsCache();
    all[key] = { t: Date.now(), r };
    const keys = Object.keys(all);
    if (keys.length > RATINGS_MAX) {
      keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - RATINGS_MAX).forEach((k) => delete all[k]);
    }
    localStorage.setItem(RATINGS_KEY, JSON.stringify(all));
  } catch { /* storage full or blocked: memory cache still works */ }
}

/** Ratings for one title, cached for a week on this device. Resolves null when unavailable. */
export function getRatings(kind: TmdbKind, id: number): Promise<Ratings | null> {
  const key = `${kind}/${id}`;
  const cached = readRatingsCache()[key];
  if (cached && Date.now() - cached.t < RATINGS_TTL) return Promise.resolve(cached.r);
  if (ratingsDisabled) return Promise.resolve(null);
  let p = ratingsMemory.get(key);
  if (!p) {
    const run = async (): Promise<Ratings | null> => {
      // Until the first answer arrives, other requests wait: if the server has no ratings
      // provider configured, that costs one 503 instead of one per card.
      if (firstRatingsRequest) await firstRatingsRequest.catch(() => {});
      if (ratingsDisabled) return null;
      const res = await fetch(`/api/ratings?${new URLSearchParams({ tmdb: String(id), type: kind })}`);
      if (res.status === 503) { ratingsDisabled = true; return null; }
      if (!res.ok) return null;
      const r = await res.json() as Ratings;
      writeRatingsCache(key, r);
      return r;
    };
    const isFirst = !firstRatingsRequest;
    p = run().catch(() => { ratingsMemory.delete(key); return null; });
    if (isFirst) firstRatingsRequest = p;
    ratingsMemory.set(key, p);
  }
  return p;
}

// ── Where to watch ───────────────────────────────────────────────────────────

/** TMDB/JustWatch provider names → the app's platform values (for auto-filling "Platform"). */
const PROVIDER_TO_PLATFORM: [RegExp, WatchPlatform][] = [
  [/^netflix/i, 'Netflix'],
  [/^amazon prime video|^prime video/i, 'Prime Video'],
  [/^apple tv/i, 'Apple TV+'],
  [/^disney/i, 'Disney+'],
  [/^(hbo )?max\b|^hbo max/i, 'HBO Max'],
  [/^youtube/i, 'YouTube'],
];

export function platformOf(providerName: string): WatchPlatform | null {
  for (const [re, p] of PROVIDER_TO_PLATFORM) if (re.test(providerName)) return p;
  return null;
}

/** Best platform to pre-fill: a streaming service the user has, else the first known streaming service. */
export function suggestPlatform(providers: RegionProviders | undefined, myServices: string[]): WatchPlatform | null {
  const streams = [...(providers?.flatrate ?? []), ...(providers?.free ?? []), ...(providers?.ads ?? [])];
  const mapped = streams.map((p) => platformOf(p.provider_name)).filter((p): p is WatchPlatform => !!p);
  return mapped.find((p) => myServices.includes(p)) ?? mapped[0] ?? null;
}

/** The user's region: saved preference, else the browser locale's country, else US. */
export function defaultRegion(): string {
  const tag = navigator.language || 'en-US';
  const m = tag.match(/-([A-Z]{2})\b/i);
  return m ? m[1].toUpperCase() : 'US';
}

// ── Finding the TMDB id of an entry that doesn't have one yet ────────────────

interface SearchHit { id: number; title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string; media_type?: string; poster_path?: string | null; vote_average?: number; genre_ids?: number[]; overview?: string; original_language?: string }

const yearOf = (h: { release_date?: string; first_air_date?: string }) => (h.release_date ?? h.first_air_date ?? '').slice(0, 4);
const titlesOf = (h: SearchHit) => [h.title, h.name, h.original_title, h.original_name].filter(Boolean) as string[];

/** Picks the best search hit: exact title + year, then exact title ±1 year, then exact title. */
export function bestMatch<T extends SearchHit>(hits: T[], title: string, year: string): { hit: T; confident: boolean } | null {
  if (hits.length === 0) return null;
  const wanted = normalizeTitle(title);
  const y = parseInt(year, 10);
  const sameTitle = hits.filter((h) => titlesOf(h).some((t) => normalizeTitle(t) === wanted));
  const yearDiff = (h: T) => (Number.isFinite(y) ? Math.abs(parseInt(yearOf(h), 10) - y) : 0);
  const exact = sameTitle.find((h) => yearDiff(h) === 0);
  if (exact) return { hit: exact, confident: true };
  const near = sameTitle.find((h) => yearDiff(h) <= 1);
  if (near) return { hit: near, confident: true };
  if (sameTitle[0] && !Number.isFinite(y)) return { hit: sameTitle[0], confident: true };
  return { hit: sameTitle[0] ?? hits[0], confident: false };
}

/** TMDB id from an IMDb id (tt…). */
export async function findByImdb(imdbId: string): Promise<{ id: number; kind: TmdbKind; hit: SearchHit } | null> {
  const data = await tmdb<{ movie_results?: SearchHit[]; tv_results?: SearchHit[] }>(`find/${imdbId}`, { external_source: 'imdb_id' });
  const movie = data.movie_results?.[0];
  if (movie) return { id: movie.id, kind: 'movie', hit: movie };
  const tv = data.tv_results?.[0];
  if (tv) return { id: tv.id, kind: 'tv', hit: tv };
  return null;
}

/** Searches TMDB for a title; returns the best hit and whether the match is confident. */
export async function searchTitle(title: string, year: string, kind: TmdbKind | 'any'): Promise<{ hit: SearchHit; kind: TmdbKind; confident: boolean } | null> {
  const params: Record<string, string> = { query: title };
  if (kind !== 'any' && /^\d{4}$/.test(year)) params[kind === 'tv' ? 'first_air_date_year' : 'year'] = year;
  const path = kind === 'any' ? 'search/multi' : `search/${kind}`;
  let hits = (await tmdb<{ results?: SearchHit[] }>(path, params)).results ?? [];
  if (kind === 'any') hits = hits.filter((h) => h.media_type === 'movie' || h.media_type === 'tv');
  // A year filter can miss when sites disagree on the year; retry without it.
  if (hits.length === 0 && params.year) hits = (await tmdb<{ results?: SearchHit[] }>(path, { query: title })).results ?? [];
  const m = bestMatch(hits, title, year);
  if (!m) return null;
  const hitKind: TmdbKind = kind === 'any' ? (m.hit.media_type === 'tv' ? 'tv' : 'movie') : kind;
  return { hit: m.hit, kind: hitKind, confident: m.confident };
}

const resolveCache = new Map<string, Promise<number | null>>();

/** The TMDB id for a list entry: stored id, else via its IMDb id, else a confident title search. */
export function resolveTmdbId(entry: Pick<MovieEntry, 'id' | 'title' | 'year' | 'type' | 'imdbUrl' | 'tmdbId'>): Promise<number | null> {
  if (entry.tmdbId) return Promise.resolve(entry.tmdbId);
  let p = resolveCache.get(entry.id);
  if (!p) {
    p = (async () => {
      const imdbId = imdbIdOf(entry.imdbUrl);
      if (imdbId) {
        const found = await findByImdb(imdbId);
        if (found && found.kind === kindOf(entry.type)) return found.id;
      }
      const m = await searchTitle(entry.title, entry.year.slice(0, 4), kindOf(entry.type));
      return m?.confident ? m.hit.id : null;
    })().catch(() => { resolveCache.delete(entry.id); return null; });
    resolveCache.set(entry.id, p);
  }
  return p;
}

/** A Discover-card item built from details (for pasted/shared links). */
export function itemFromDetails(d: TitleDetails, kind: TmdbKind): TMDBItem {
  return {
    id: d.id,
    title: d.title, name: d.name,
    media_type: kind,
    poster_path: d.poster_path ?? null,
    vote_average: d.vote_average ?? 0,
    release_date: d.release_date, first_air_date: d.first_air_date,
    overview: d.overview ?? '',
    genre_ids: (d.genres ?? []).map((g) => g.id),
    original_language: '',
  };
}
