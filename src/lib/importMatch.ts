import type { MovieEntry, WatchMeta } from '../types';
import type { ImportCandidate } from './csvImport';
import { findByImdb, getDetails, searchTitle, TMDB_GENRES, type TmdbKind } from './titleData';
import { TMDB_IMG } from './tmdb';

export interface MatchHit {
  id: number;
  kind: TmdbKind;
  title: string;
  year: string;
  posterPath: string | null;
  voteAverage: number;
  genreIds: number[];
}

export interface MatchResult {
  candidate: ImportCandidate;
  hit: MatchHit | null;
  confident: boolean;
}

const CONCURRENCY = 6;

function toHit(h: { id: number; title?: string; name?: string; release_date?: string; first_air_date?: string; poster_path?: string | null; vote_average?: number; genre_ids?: number[] }, kind: TmdbKind): MatchHit {
  return {
    id: h.id, kind,
    title: h.title ?? h.name ?? '',
    year: (h.release_date ?? h.first_air_date ?? '').slice(0, 4),
    posterPath: h.poster_path ?? null,
    voteAverage: h.vote_average ?? 0,
    genreIds: h.genre_ids ?? [],
  };
}

async function matchOne(c: ImportCandidate): Promise<MatchResult> {
  if (c.tmdbRef) {
    const d = await getDetails(c.tmdbRef.kind, c.tmdbRef.id).catch(() => null);
    if (d) return { candidate: c, hit: toHit({ ...d, genre_ids: (d.genres ?? []).map((g) => g.id) }, c.tmdbRef.kind), confident: true };
  }
  if (c.imdbId) {
    const found = await findByImdb(c.imdbId).catch(() => null);
    if (found) return { candidate: c, hit: toHit(found.hit, found.kind), confident: true };
  }
  const kind: TmdbKind | 'any' = c.type === 'Series' ? 'tv' : c.type === 'Film' ? 'movie' : 'any';
  // "Wonder Woman 1984": a title that ends in a year-like number wins over "Wonder Woman" from 1984.
  if (c.fullTitle) {
    const whole = await searchTitle(c.fullTitle, '', kind).catch(() => null);
    if (whole?.confident) return { candidate: c, hit: toHit(whole.hit, whole.kind), confident: true };
  }
  const m = await searchTitle(c.title, c.year, kind).catch(() => null);
  return m ? { candidate: c, hit: toHit(m.hit, m.kind), confident: m.confident } : { candidate: c, hit: null, confident: false };
}

/** Matches every candidate to a TMDB title, a few at a time. Results keep the input order. */
export async function matchCandidates(
  candidates: ImportCandidate[],
  onProgress: (done: number) => void,
  isCancelled: () => boolean,
): Promise<MatchResult[]> {
  const results: MatchResult[] = new Array(candidates.length);
  let next = 0, done = 0;
  const worker = async () => {
    while (next < candidates.length && !isCancelled()) {
      const i = next++;
      results[i] = await matchOne(candidates[i]);
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results.filter(Boolean);
}

/** A matched row → a list entry + its watch data (ids are assigned on import). */
export function toEntry(r: MatchResult & { hit: MatchHit }): { entry: MovieEntry; meta: WatchMeta } {
  const id = crypto.randomUUID();
  const type = r.hit.kind === 'tv' ? 'Series' : 'Film';
  const entry: MovieEntry = {
    id,
    title: r.hit.title,
    year: r.hit.year,
    type,
    section: type === 'Series' ? 'TV Series' : 'General',
    country: '',
    genre: r.hit.genreIds.map((g) => TMDB_GENRES[g]).filter(Boolean).join(', '),
    imdbRating: r.hit.voteAverage > 0 ? r.hit.voteAverage.toFixed(1) : '',
    ratingSource: 'tmdb',
    imdbUrl: r.candidate.imdbId ? `https://www.imdb.com/title/${r.candidate.imdbId}/` : '',
    tmdbId: r.hit.id,
    isCustom: true,
  };
  if (r.hit.posterPath) entry.posterUrl = `${TMDB_IMG}${r.hit.posterPath}`;
  const meta: WatchMeta = { id, status: r.candidate.status };
  if (r.candidate.rating !== undefined) meta.personalRating = r.candidate.rating;
  if (r.candidate.watchedOn) meta.watchedOn = r.candidate.watchedOn;
  return { entry, meta };
}
