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

const MAX_COMING_SOON = 24;

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/**
 * The most anticipated films and series releasing in the next 13 months, soonest first.
 * TMDB's "trending" ranks by attention, not by whether something is out yet, which is why an
 * unreleased blockbuster can top Trending; this feed is where upcoming releases belong.
 */
export async function fetchComingSoon(signal?: AbortSignal, today = todayWatchDate()): Promise<TMDBItem[]> {
  const end = addDays(today, 400);
  const base = { language: 'en-US', sort_by: 'popularity.desc' };
  const [movies, shows] = await Promise.all([
    tmdb<{ results?: TMDBItem[] }>('discover/movie', { ...base, 'primary_release_date.gte': today, 'primary_release_date.lte': end, with_release_type: '2|3' }, signal),
    tmdb<{ results?: TMDBItem[] }>('discover/tv', { ...base, 'first_air_date.gte': today, 'first_air_date.lte': end }, signal),
  ]);
  const tag = (list: TMDBItem[] | undefined, media_type: 'movie' | 'tv') => (list ?? []).map((i) => ({ ...i, media_type }));
  return [...tag(movies.results, 'movie'), ...tag(shows.results, 'tv')]
    .filter((i) => i.poster_path && (i.title || i.name) && isUnreleased(i, addDays(today, -1)))
    // Keep the most anticipated overall (so obscure releases don't pad the list), then show them soonest first.
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, MAX_COMING_SOON)
    .sort((a, b) => releaseDateOf(a).localeCompare(releaseDateOf(b)) || (b.popularity ?? 0) - (a.popularity ?? 0));
}

/** Month heading for the Coming soon list: "This week" for the next 7 days, else "December 2026". */
export function releaseGroupLabel(date: string, today = todayWatchDate()): string {
  if (date <= addDays(today, 7)) return 'This week';
  const [y, m] = date.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
