/**
 * The IMDb Top 250, for Discover's "Top 250" tab.
 *
 * IMDb has no free public API, so the chart is read from a public MDBList list that mirrors it
 * (MDBList is already our ratings provider). The key stays server-side. The response is tiny and
 * changes slowly, so it is cached for a day at the CDN and in memory: a day of traffic costs a handful
 * of the ~1000 daily MDBList requests that ratings share.
 *
 * Which list: `TOPLIST_IMDB250` = "<mdblist user>/<list slug>" (server-only, optional); the default is a
 * community-maintained mirror. If that list ever disappears, point the variable at another one.
 */

export const DEFAULT_LIST = 'linaspuransen/top-250-movies';

export interface TopListItem {
  rank: number;
  /** TMDB id when the list gave one (the client double-checks it against the IMDb id). */
  tmdb?: number;
  imdb: string;
  title: string;
  year?: number;
}

const json = (status: number, body: unknown, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });

const CACHE_OK = 'public, s-maxage=86400, stale-while-revalidate=604800';
const MAX_ITEMS = 250;

/** "user/slug", letters, digits and a few separators only; anything else falls back to the default. */
export function listPath(configured: string | undefined): string {
  const v = configured?.trim() ?? '';
  return /^[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9_.-]{1,100}$/.test(v) ? v : DEFAULT_LIST;
}

const posInt = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/**
 * MDBList list-items response → our items, in rank order. Takes only what is needed, drops rows without
 * an IMDb id, repeats and anything that isn't a film, and caps the length. The answer is untrusted.
 */
export function parseTopList(data: unknown): TopListItem[] {
  const movies = (data as { movies?: unknown } | null)?.movies;
  if (!Array.isArray(movies)) return [];
  const seen = new Set<string>();
  const out: TopListItem[] = [];
  movies.forEach((raw, index) => {
    const m = (raw ?? {}) as { id?: unknown; ids?: { tmdb?: unknown }; rank?: unknown; imdb_id?: unknown; title?: unknown; release_year?: unknown; mediatype?: unknown };
    if (m.mediatype !== undefined && m.mediatype !== 'movie') return;
    const imdb = typeof m.imdb_id === 'string' && /^tt\d{5,10}$/.test(m.imdb_id) ? m.imdb_id : '';
    if (!imdb || seen.has(imdb)) return;
    seen.add(imdb);
    out.push({
      rank: posInt(m.rank) ?? index + 1,
      tmdb: posInt(m.ids?.tmdb) ?? posInt(m.id),
      imdb,
      title: typeof m.title === 'string' ? m.title.slice(0, 200) : '',
      year: posInt(m.release_year),
    });
  });
  return out.sort((a, b) => a.rank - b.rank).slice(0, MAX_ITEMS);
}

let memory: { at: number; path: string; items: TopListItem[] } | null = null;
const MEMORY_MS = 6 * 3600_000;

/** Test hook. */
export function clearTopListMemory() { memory = null; }

export async function handleTopListRequest(request: Request, keys: { mdblist?: string; list?: string }): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
  if (!keys.mdblist) return json(503, { error: 'Top 250 needs MDBLIST_API_KEY' });
  const path = listPath(keys.list);

  if (memory && memory.path === path && Date.now() - memory.at < MEMORY_MS) return json(200, { items: memory.items }, CACHE_OK);

  try {
    const url = new URL(`https://api.mdblist.com/lists/${path}/items`);
    url.searchParams.set('limit', String(MAX_ITEMS));
    url.searchParams.set('mediatype', 'movie');
    url.searchParams.set('sort', 'rank');
    url.searchParams.set('apikey', keys.mdblist);
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      console.error(`Top 250: MDBList answered ${res.status}`);
      return json(res.status === 429 ? 429 : 502, { error: 'Top 250 unavailable' });
    }
    const items = parseTopList(await res.json());
    // A list that came back nearly empty is a wrong list or an outage: don't cache it, don't show it.
    if (items.length < 50) {
      console.error(`Top 250: list ${path} returned only ${items.length} films`);
      return json(502, { error: 'Top 250 unavailable' });
    }
    memory = { at: Date.now(), path, items };
    return json(200, { items }, CACHE_OK);
  } catch {
    return json(502, { error: 'Top 250 unavailable' });
  }
}
