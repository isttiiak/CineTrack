import { tmdb } from './tmdb';
import { normalize } from './search';
import {
  filmographyFrom, nameMatchesQuery, pickCompany, pickPerson, popularityScore, relevanceTier,
  type CompanyHit, type PersonHit,
} from './discoverSearch';
import type { TMDBItem } from '../hooks/useTMDBDiscover';

/**
 * AI search, client side. The server (api/ai.ts) turns the request into a *plan* of filters; this
 * file resolves the plan's names to TMDB ids and runs the discover query. The model never supplies
 * titles, so every result is a real TMDB title, and a bad plan just finds less.
 */

export type { AiPlan } from '../../api/_aiTasks';
import type { AiPlan } from '../../api/_aiTasks';
import { runAiTask } from './ai';

export { AiSearchError, AI_MESSAGES, type AiErrorCode } from './ai';

export interface PlanResponse { plan: AiPlan | null; remaining: number | null; limit: number | null; cached: boolean }

/** Asks for a plan (own key or shared AI, see lib/ai.ts). Repeats come from this browser's cache and cost nothing. */
export async function fetchPlan(query: string, signal?: AbortSignal): Promise<PlanResponse> {
  const r = await runAiTask('search', { query }, { signal });
  return { plan: r.result, remaining: r.remaining, limit: r.limit, cached: r.cached };
}

// ── Running a plan against TMDB ─────────────────────────────────────────────

type Kind = 'movie' | 'tv';

/** TMDB uses different genre ids for films and series, and series have no Horror, Thriller, Romance… */
export const GENRE_IDS: Record<string, { movie?: number; tv?: number }> = {
  Action: { movie: 28, tv: 10759 }, Adventure: { movie: 12, tv: 10759 }, Animation: { movie: 16, tv: 16 },
  Comedy: { movie: 35, tv: 35 }, Crime: { movie: 80, tv: 80 }, Documentary: { movie: 99, tv: 99 },
  Drama: { movie: 18, tv: 18 }, Family: { movie: 10751, tv: 10751 }, Fantasy: { movie: 14, tv: 10765 },
  History: { movie: 36 }, Horror: { movie: 27 }, Music: { movie: 10402 }, Mystery: { movie: 9648, tv: 9648 },
  Romance: { movie: 10749 }, 'Sci-Fi': { movie: 878, tv: 10765 }, Thriller: { movie: 53 },
  War: { movie: 10752, tv: 10768 }, Western: { movie: 37, tv: 37 },
};

/** Genre ids for one kind, and the genres that kind has no id for. */
export function genreIdsFor(kind: Kind, genres: string[]): { ids: number[]; missing: string[] } {
  const ids: number[] = [];
  const missing: string[] = [];
  for (const g of genres) {
    const id = GENRE_IDS[g]?.[kind];
    if (id === undefined) missing.push(g); else if (!ids.includes(id)) ids.push(id);
  }
  return { ids, missing };
}

export interface ResolvedNames {
  people: { id: number; name: string; department?: string }[];
  companyIds: number[];
  companyLabels: string[];
  keywordIds: number[];
  /** keyword ids standing in for genres a series cannot be filtered by ("horror") */
  genreKeywordIds: number[];
  unresolved: string[];
}

const SORTS: Record<AiPlan['sort'], { movie: string; tv: string; minVotes: number }> = {
  popularity: { movie: 'popularity.desc', tv: 'popularity.desc', minVotes: 100 },
  rating: { movie: 'vote_average.desc', tv: 'vote_average.desc', minVotes: 300 },
  newest: { movie: 'primary_release_date.desc', tv: 'first_air_date.desc', minVotes: 30 },
  oldest: { movie: 'primary_release_date.asc', tv: 'first_air_date.asc', minVotes: 100 },
};

/** The discover query for one kind, or null when it can't express the plan (e.g. a series "horror" with no stand-in). */
export function buildDiscoverParams(kind: Kind, plan: AiPlan, r: ResolvedNames, today: string): Record<string, string> | null {
  const { ids, missing } = genreIdsFor(kind, plan.genres);
  const keywordIds = [...r.keywordIds, ...(kind === 'tv' ? r.genreKeywordIds : [])];
  if (kind === 'tv' && missing.length > 0 && r.genreKeywordIds.length === 0) return null;
  if (kind === 'tv' && r.people.length > 0) return null;                 // discover/tv has no people filter: see credits path
  const sort = SORTS[plan.sort];
  const params: Record<string, string> = {
    language: 'en-US',
    sort_by: sort[kind],
    'vote_count.gte': String(r.people.length ? Math.min(sort.minVotes, 50) : sort.minVotes),
  };
  if (ids.length) params.with_genres = ids.join(',');
  if (kind === 'movie' && r.people.length) params.with_people = r.people.map((p) => p.id).join(',');
  if (r.companyIds.length) params.with_companies = r.companyIds.join('|');
  if (keywordIds.length) params.with_keywords = [...new Set(keywordIds)].join('|');
  if (plan.country) params.with_origin_country = plan.country;
  if (plan.language) params.with_original_language = plan.language;
  if (plan.minRating) params['vote_average.gte'] = String(plan.minRating);
  const [from, to] = kind === 'movie' ? ['primary_release_date.gte', 'primary_release_date.lte'] : ['first_air_date.gte', 'first_air_date.lte'];
  if (plan.yearFrom) params[from] = `${plan.yearFrom}-01-01`;
  if (plan.yearTo) params[to] = `${plan.yearTo}-12-31`;
  else if (plan.sort === 'newest') params[to] = today;                       // "newest" must not mean "not out yet"
  return params;
}

/** Checks the parts of a plan that can be judged from a result's own fields (credits and recommendations). */
export function matchesPlan(item: TMDBItem, plan: AiPlan): boolean {
  const kind = item.media_type;
  const year = parseInt((item.release_date ?? item.first_air_date ?? '').slice(0, 4), 10);
  if (plan.type !== 'any' && plan.type !== kind) return false;
  if (plan.yearFrom && !(year >= plan.yearFrom)) return false;
  if (plan.yearTo && !(year <= plan.yearTo)) return false;
  if (plan.minRating && !(item.vote_average >= plan.minRating)) return false;
  if (plan.language && item.original_language !== plan.language) return false;
  if (plan.genres.length) {
    const wanted = genreIdsFor(kind, plan.genres).ids;
    if (wanted.length === 0 || !wanted.every((id) => item.genre_ids?.includes(id))) return false;
  }
  return true;
}

const dateOf = (i: TMDBItem) => i.release_date ?? i.first_air_date ?? '';
export function rankForPlan(items: TMDBItem[], sort: AiPlan['sort']): TMDBItem[] {
  const by: Record<AiPlan['sort'], (a: TMDBItem, b: TMDBItem) => number> = {
    popularity: (a, b) => popularityScore(b) - popularityScore(a),
    rating: (a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0) || popularityScore(b) - popularityScore(a),
    newest: (a, b) => dateOf(b).localeCompare(dateOf(a)),
    oldest: (a, b) => (dateOf(a) || '9999').localeCompare(dateOf(b) || '9999'),
  };
  return [...items].sort(by[sort]);
}

const regionName = (code: string) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; } };
const languageName = (code: string) => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code; } catch { return code; } };

/** Short labels for what was searched, shown so the user can see (and distrust) the interpretation. */
export function planChips(plan: AiPlan, r: ResolvedNames): string[] {
  const chips: string[] = [];
  if (plan.type === 'movie') chips.push('Movies'); else if (plan.type === 'tv') chips.push('Series');
  chips.push(...plan.genres);
  if (plan.yearFrom && plan.yearTo) chips.push(plan.yearFrom === plan.yearTo ? String(plan.yearFrom) : `${plan.yearFrom}–${plan.yearTo}`);
  else if (plan.yearFrom) chips.push(`from ${plan.yearFrom}`);
  else if (plan.yearTo) chips.push(`until ${plan.yearTo}`);
  if (plan.country) chips.push(regionName(plan.country));
  if (plan.language) chips.push(`${languageName(plan.language)} language`);
  chips.push(...r.people.map((p) => p.name), ...r.companyLabels, ...plan.keywords);
  if (plan.minRating) chips.push(`rated ${plan.minRating}+`);
  if (plan.similarTo) chips.push(`like ${plan.similarTo}`);
  if (plan.sort === 'rating') chips.push('top rated'); else if (plan.sort === 'newest') chips.push('newest first'); else if (plan.sort === 'oldest') chips.push('oldest first');
  return chips;
}

const first = <T,>(p: Promise<{ results?: T[] }>): Promise<T[]> => p.then((d) => d.results ?? []).catch(() => [] as T[]);

/** Turns the plan's names into TMDB ids. Names that can't be found are reported, not guessed. */
async function resolveNames(plan: AiPlan, signal?: AbortSignal): Promise<ResolvedNames> {
  const out: ResolvedNames = { people: [], companyIds: [], companyLabels: [], keywordIds: [], genreKeywordIds: [], unresolved: [] };
  const wantsTv = plan.type !== 'movie';
  const standIns = wantsTv ? [...new Set(genreIdsFor('tv', plan.genres).missing)] : [];

  const keywordId = async (text: string): Promise<number | null> => {
    const hits = await first<{ id: number; name: string }>(tmdb('search/keyword', { query: text }, signal));
    const q = normalize(text);
    return (hits.find((h) => normalize(h.name) === q) ?? null)?.id ?? null;
  };

  await Promise.all([
    ...plan.people.map(async (name) => {
      const hits = await first<PersonHit>(tmdb('search/person', { query: name, language: 'en-US' }, signal));
      const hit = pickPerson(name, hits);
      if (hit) out.people.push({ id: hit.id, name: hit.name, department: hit.known_for_department }); else out.unresolved.push(name);
    }),
    ...plan.companies.map(async (name) => {
      const hits = await first<CompanyHit>(tmdb('search/company', { query: name }, signal));
      const hit = pickCompany(name, hits) ?? (hits[0] && nameMatchesQuery(name, hits[0].name) ? { ids: [hits[0].id], label: hits[0].name } : null);
      if (hit) { out.companyIds.push(...hit.ids); out.companyLabels.push(hit.label); } else out.unresolved.push(name);
    }),
    ...plan.keywords.map(async (text) => {
      const id = await keywordId(text);
      if (id) out.keywordIds.push(id); else out.unresolved.push(text);
    }),
    ...standIns.map(async (genre) => {
      const id = await keywordId(genre.toLowerCase());
      if (id) out.genreKeywordIds.push(id);
    }),
  ]);
  return out;
}

export interface AiResult { items: TMDBItem[]; chips: string[]; notes: string[] }

const withKind = (list: TMDBItem[] | undefined, kind: Kind): TMDBItem[] =>
  (list ?? []).map((r) => ({ ...r, media_type: kind })).filter((r) => r.title || r.name);

/** Runs a plan: names → ids, then the discover query (films and/or series), people's credits and "like X" recommendations. */
export async function executePlan(plan: AiPlan, signal?: AbortSignal, today = new Date().toISOString().slice(0, 10)): Promise<AiResult> {
  const r = await resolveNames(plan, signal);
  const notes = r.unresolved.map((n) => `Couldn't find “${n}”`);
  const kinds: Kind[] = plan.type === 'any' ? ['movie', 'tv'] : [plan.type];
  const pages = kinds.length === 1 ? ['1', '2'] : ['1'];
  const lists: TMDBItem[][] = [];

  // Anything to filter by? (names that failed to resolve don't count)
  const hasFilter = plan.genres.length || plan.yearFrom || plan.yearTo || plan.country || plan.language || plan.minRating
    || r.people.length || r.companyIds.length || r.keywordIds.length;

  if (hasFilter) {
    for (const kind of kinds) {
      const params = buildDiscoverParams(kind, plan, r, today);
      if (params) {
        const got = await Promise.all(pages.map((page) =>
          first<TMDBItem>(tmdb(`discover/${kind}`, { ...params, page }, signal)).then((l) => withKind(l, kind))));
        lists.push(...got);
      } else if (kind === 'tv' && r.people.length) {
        // Series can't be filtered by person in discover: use each person's credits and judge them here.
        for (const p of r.people) {
          const credits = await tmdb<{ cast?: TMDBItem[]; crew?: TMDBItem[] }>(`person/${p.id}/combined_credits`, { language: 'en-US' }, signal).catch(() => null);
          if (credits) lists.push((filmographyFrom(credits as never, p.department) as unknown as TMDBItem[]).filter((i) => i.media_type === 'tv' && matchesPlan(i, plan)));
        }
      } else if (kind === 'tv' && plan.genres.length) {
        notes.push('TMDB has no matching genre for series, so series were left out.');
      }
    }
  }

  let similar: TMDBItem[] = [];
  if (plan.similarTo) {
    const hits = await first<TMDBItem>(tmdb('search/multi', { query: plan.similarTo, language: 'en-US' }, signal));
    // The best-known title with that name ("Oldboy" the 2003 original, not its 2013 remake).
    const seed = hits.filter((h) => (h.media_type === 'movie' || h.media_type === 'tv') && relevanceTier(plan.similarTo!, h) >= 2)
      .sort((a, b) => relevanceTier(plan.similarTo!, b) - relevanceTier(plan.similarTo!, a) || popularityScore(b) - popularityScore(a))[0];
    if (seed) {
      const rec = await first<TMDBItem>(tmdb(`${seed.media_type}/${seed.id}/recommendations`, { language: 'en-US' }, signal));
      similar = withKind(rec, seed.media_type).filter((i) => matchesPlan(i, { ...plan, genres: [], language: undefined }));
    } else notes.push(`Couldn't find “${plan.similarTo}”`);
  }

  const seen = new Set<string>();
  const unique = (list: TMDBItem[]) => list.filter((i) => !seen.has(`${i.media_type}-${i.id}`) && (seen.add(`${i.media_type}-${i.id}`), true));
  // Recommendations keep TMDB's own order (closest first) unless the user asked for another order.
  const similarOrdered = plan.sort === 'popularity' ? unique(similar) : rankForPlan(unique(similar), plan.sort);
  const items = [...similarOrdered, ...rankForPlan(unique(lists.flat()), plan.sort)].slice(0, 40);
  return { items, chips: planChips(plan, r), notes };
}
