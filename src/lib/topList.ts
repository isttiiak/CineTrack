import type { TMDBItem } from '../hooks/useTMDBDiscover';
import { findByImdb, getDetails, itemFromDetails, type TitleDetails } from './titleData';

/** The IMDb Top 250 as /api/toplist serves it (api/_toplist.ts). */
export interface TopListItem { rank: number; tmdb?: number; imdb: string; title: string; year?: number }

export const TOP_PAGE_SIZE = 24;

export const topRankLabel = (rank: number) => `#${rank} on IMDb Top 250`;

/** The slice of the list for page `page` (1-based) and whether more follows. */
export function topPage(list: TopListItem[], page: number, size = TOP_PAGE_SIZE): { items: TopListItem[]; more: boolean } {
  const start = Math.max(0, (page - 1) * size);
  return { items: list.slice(start, start + size), more: start + size < list.length };
}

/** True when TMDB's record for `tmdbId` is the film the list means (the list's own ids are not trusted blindly). */
export const detailsMatch = (d: Pick<TitleDetails, 'external_ids'> | undefined, imdb: string) => d?.external_ids?.imdb_id === imdb;

let cached: Promise<TopListItem[]> | null = null;

/** The whole list, once per page load (the server caches it for a day). A failure is not remembered. */
export function fetchTopList(signal?: AbortSignal): Promise<TopListItem[]> {
  if (!cached) {
    cached = fetch('/api/toplist', { signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Top 250 ${res.status}`);
        const data = await res.json() as { items?: unknown };
        const items = Array.isArray(data.items) ? data.items as TopListItem[] : [];
        if (items.length === 0) throw new Error('Top 250 empty');
        return items;
      })
      .catch((err) => { cached = null; throw err; });
  }
  return cached;
}

/** One title of the list as a Discover card, or null when TMDB doesn't know it. */
async function resolveOne(entry: TopListItem): Promise<TMDBItem | null> {
  // The list's own TMDB id first; if it is missing, unknown to TMDB or names a different film, go by the IMDb id.
  if (entry.tmdb) {
    try {
      const d = await getDetails('movie', entry.tmdb);
      if (detailsMatch(d, entry.imdb)) return itemFromDetails(d, 'movie');
    } catch { /* fall through to the IMDb id */ }
  }
  try {
    const found = await findByImdb(entry.imdb);
    if (!found || found.kind !== 'movie') return null;
    return itemFromDetails(await getDetails('movie', found.id), 'movie');
  } catch {
    return null;
  }
}

/** One page of the Top 250: the cards in rank order and a rank label for each. */
export async function fetchTopPage(page: number, signal?: AbortSignal): Promise<{ items: TMDBItem[]; reasons: Record<number, string>; more: boolean }> {
  const list = await fetchTopList(signal);
  const slice = topPage(list, page);
  const resolved = await Promise.all(slice.items.map(resolveOne));
  const items: TMDBItem[] = [];
  const reasons: Record<number, string> = {};
  resolved.forEach((item, i) => {
    if (!item) return;
    items.push(item);
    reasons[item.id] = topRankLabel(slice.items[i].rank);
  });
  return { items, reasons, more: slice.more };
}
