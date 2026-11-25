import { tmdb } from './tmdb';
import { todayWatchDate } from './watchDate';
import type { TMDBItem } from '../hooks/useTMDBDiscover';

const releaseDateOf = (i: { release_date?: string; first_air_date?: string }) => i.release_date || i.first_air_date || '';

/** True when a title's release (or first air) date is still ahead of us. */
export function isUnreleased(item: { release_date?: string; first_air_date?: string }, today = todayWatchDate()): boolean {
  const d = releaseDateOf(item);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d > today;
}

export const releaseDate = releaseDateOf;

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// ── Paging ───────────────────────────────────────────────────────────────────

/** How far a feed goes: TMDB itself stops at 500 pages, but past ~40 (800 titles) a popularity list is noise. */
export const MAX_PAGES = 40;

/**
 * Whether another page is worth fetching. `totalPages` is what TMDB reported (it caps at 500); the
 * page number counts pages already loaded.
 */
export function canLoadMore(loadedPages: number, totalPages: number, cap = MAX_PAGES): boolean {
  return loadedPages >= 1 && loadedPages < Math.min(totalPages, 500, cap);
}

/**
 * Appends a page to what is already shown, dropping repeats. TMDB lists shift between requests (a title
 * can move from page 3 to page 2 while you scroll) and movie and TV ids overlap, so the identity is
 * media type + id. Earlier items keep their position.
 */
export function mergePage<T extends { id: number; media_type?: string }>(shown: T[], incoming: T[]): T[] {
  const key = (i: T) => `${i.media_type ?? ''}-${i.id}`;
  const seen = new Set(shown.map(key));
  const added = incoming.filter((i) => !seen.has(key(i)) && (seen.add(key(i)), true));
  return added.length ? [...shown, ...added] : shown;
}

export interface PageResult<T> { items: T[]; more: boolean; nextPage?: number }

/**
 * Fetches the next page(s) and merges them into what is shown. A page made only of titles that are
 * already shown (TMDB lists shift while you scroll) adds nothing the user could see, so the next page is
 * fetched too, up to `maxSkips` extra times. Returns the new list (the same array when nothing was added).
 */
export async function pullNextPage<T extends { id: number; media_type?: string }>(
  shown: T[], page: number, fetchPage: (page: number) => Promise<PageResult<T>>, maxSkips = 3,
): Promise<{ items: T[]; page: number; more: boolean }> {
  let items = shown, current = page, more = true;
  for (let skipped = 0; skipped <= maxSkips && more; skipped++) {
    const r = await fetchPage(current);
    current = r.nextPage ?? current + 1;
    more = r.more;
    items = mergePage(items, r.items);
    if (items !== shown) break;
  }
  return { items, page: current, more };
}

// ── The movie / TV tabs: how recent ──────────────────────────────────────────

/** `recent` is the default; the older eras are one tap away so classics are still reachable. */
export type Era = 'recent' | 'five' | 'all';
export const ERAS: { id: Era; label: string }[] = [
  { id: 'recent', label: 'New' },
  { id: 'five', label: 'Last 5 years' },
  { id: 'all', label: 'All time' },
];

export type FeedTab = 'trending' | 'movies' | 'tv';

export interface FeedRequest { path: string; params: Record<string, string> }

// Days back from today. Recent means the last ~18 months of films and ~30 months of series (a series
// needs longer to build an audience).
const WINDOW_DAYS: Record<Exclude<Era, 'all'>, { movies: number; tv: number }> = {
  recent: { movies: 548, tv: 913 },
  five: { movies: 1826, tv: 1826 },
};
// Vote floors keep unrated or barely seen titles out; they rise with the era because older titles have had time to collect votes.
const VOTE_FLOOR: Record<Era, { movies: number; tv: number }> = {
  recent: { movies: 100, tv: 50 },
  five: { movies: 300, tv: 150 },
  all: { movies: 1000, tv: 500 },
};

/** The first date of an era's window ('' for all time), for the "since …" caption. */
export function eraStart(tab: 'movies' | 'tv', era: Era, today = todayWatchDate()): string {
  return era === 'all' ? '' : addDays(today, -WINDOW_DAYS[era][tab]);
}

/**
 * The TMDB request behind one page of a Discover tab. Trending is TMDB's own attention ranking (always
 * current). Movies and TV are `discover` lists: released/aired up to today (unreleased titles live in
 * Coming soon), inside the era's window, most popular first, above a vote floor. Only parameters the
 * proxy already allows are used.
 */
export function feedRequest(tab: FeedTab, era: Era, page: number, today = todayWatchDate()): FeedRequest {
  const base = { language: 'en-US', page: String(page) };
  if (tab === 'trending') return { path: 'trending/all/week', params: base };
  const since = eraStart(tab, era, today);
  const dates = tab === 'movies'
    ? { ...(since ? { 'primary_release_date.gte': since } : {}), 'primary_release_date.lte': today }
    : { ...(since ? { 'first_air_date.gte': since } : {}), 'first_air_date.lte': today };
  return {
    path: tab === 'movies' ? 'discover/movie' : 'discover/tv',
    params: { ...base, ...dates, sort_by: 'popularity.desc', 'vote_count.gte': String(VOTE_FLOOR[era][tab]) },
  };
}

/** TMDB list results → items we can show: titles only (no people), with a media type (discover results have none). */
export function normalizeFeedItems(results: unknown, tab: FeedTab): TMDBItem[] {
  const list = Array.isArray(results) ? (results as { id?: number; title?: string; name?: string; media_type?: string }[]) : [];
  return list
    .filter((i) => typeof i.id === 'number' && i.media_type !== 'person' && (i.title || i.name))
    .map((i) => ({ ...i, media_type: i.media_type === 'movie' || i.media_type === 'tv' ? i.media_type : tab === 'movies' ? 'movie' : 'tv' })) as TMDBItem[];
}

// ── Coming soon: one month per page ──────────────────────────────────────────

const MAX_PER_MONTH = 24;
const WINDOW = 30;
/** 14 windows of 30 days: about 14 months ahead, which is as far as release dates are reliable. */
export const COMING_SOON_PAGES = 14;

/** Page n (1-based) of Coming soon covers 30 days, the first starting today. */
export function comingSoonWindow(page: number, today = todayWatchDate()): { from: string; to: string } {
  const from = addDays(today, (page - 1) * WINDOW);
  return { from, to: addDays(from, WINDOW - 1) };
}

/**
 * One month of the most anticipated films and series, soonest first. Paging by date (rather than by
 * popularity page) keeps the whole list in release order as you scroll: the next page is simply the
 * next month. `nextPage` is null at the end. TMDB's "trending" ranks by attention, not by whether something is out yet, which is why an
 * unreleased blockbuster can top Trending; this feed is where upcoming releases belong. A quiet month
 * is skipped over (a handful of windows at most) so "Load more" never returns nothing while more exist.
 */
export async function fetchComingSoonPage(page: number, signal?: AbortSignal, today = todayWatchDate()): Promise<{ items: TMDBItem[]; nextPage: number | null }> {
  const base = { language: 'en-US', sort_by: 'popularity.desc' };
  const tag = (list: TMDBItem[] | undefined, media_type: 'movie' | 'tv') => (list ?? []).map((i) => ({ ...i, media_type }));
  for (let p = page, tries = 0; p <= COMING_SOON_PAGES && tries < 6; p++, tries++) {
    const { from, to } = comingSoonWindow(p, today);
    const [movies, shows] = await Promise.all([
      tmdb<{ results?: TMDBItem[] }>('discover/movie', { ...base, 'primary_release_date.gte': from, 'primary_release_date.lte': to, with_release_type: '2|3' }, signal),
      tmdb<{ results?: TMDBItem[] }>('discover/tv', { ...base, 'first_air_date.gte': from, 'first_air_date.lte': to }, signal),
    ]);
    const items = [...tag(movies.results, 'movie'), ...tag(shows.results, 'tv')]
      .filter((i) => i.poster_path && (i.title || i.name) && isUnreleased(i, addDays(today, -1)))
      // Keep the most anticipated of the month (so obscure releases don't pad the list), then soonest first.
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, MAX_PER_MONTH)
      .sort((a, b) => releaseDateOf(a).localeCompare(releaseDateOf(b)) || (b.popularity ?? 0) - (a.popularity ?? 0));
    // `nextPage` tells the caller where to continue, which is after any quiet months that were skipped.
    if (items.length) return { items, nextPage: p < COMING_SOON_PAGES ? p + 1 : null };
  }
  return { items: [], nextPage: null };
}

/** Month heading for the Coming soon list: "This week" for the next 7 days, else "December 2026". */
export function releaseGroupLabel(date: string, today = todayWatchDate()): string {
  if (date <= addDays(today, 7)) return 'This week';
  const [y, m] = date.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
