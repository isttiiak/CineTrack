/**
 * Ratings from every major site for one title, normalised to a single shape.
 * GET /api/ratings?tmdb=<id>&type=movie|tv   (or ?imdb=tt…)
 *
 * Sources, in order of preference (both optional, both free with ~1 000 requests/day):
 *  - MDBList (MDBLIST_API_KEY): IMDb, Rotten Tomatoes (critics + audience), Metacritic,
 *    Letterboxd, TMDB, Trakt — looked up directly by TMDB id.
 *  - OMDb (OMDB_API_KEY): IMDb, Rotten Tomatoes, Metacritic — needs the IMDb id, which is
 *    fetched from TMDB first.
 * Responses are CDN-cached for a day, so popular titles cost one upstream call per day in total.
 */

export interface Ratings {
  imdbId?: string;
  imdb?: number;          // 0–10
  imdbVotes?: number;
  rt?: number;            // Rotten Tomatoes critics, 0–100 %
  rtAudience?: number;    // Rotten Tomatoes audience ("Popcornmeter"), 0–100 %
  metacritic?: number;    // 0–100
  letterboxd?: number;    // 0–5
  tmdb?: number;          // 0–10
  trakt?: number;         // 0–100 %
  provider: 'mdblist' | 'omdb';
}

export interface RatingsKeys { mdblist?: string; omdb?: string; tmdb?: string }

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Maps an MDBList `ratings` array ({ source, value, score, votes }) to our shape. */
export function fromMdblist(data: { imdb_id?: unknown; ratings?: unknown }): Ratings {
  const out: Ratings = { provider: 'mdblist' };
  if (typeof data.imdb_id === 'string' && /^tt\d+$/.test(data.imdb_id)) out.imdbId = data.imdb_id;
  for (const r of Array.isArray(data.ratings) ? data.ratings : []) {
    if (!r || typeof r !== 'object') continue;
    const { source, value, score, votes } = r as Record<string, unknown>;
    switch (source) {
      case 'imdb': out.imdb = num(value); out.imdbVotes = num(votes); break;
      case 'tomatoes': out.rt = num(value) ?? num(score); break;
      case 'popcorn': out.rtAudience = num(value) ?? num(score); break;
      case 'metacritic': out.metacritic = num(value) ?? num(score); break;
      case 'letterboxd': out.letterboxd = num(value); break;
      case 'tmdb': { const v = num(value) ?? num(score); out.tmdb = v !== undefined && v > 10 ? v / 10 : v; break; }
      case 'trakt': out.trakt = num(value) ?? num(score); break;
    }
  }
  return out;
}

/** Maps an OMDb response to our shape. */
export function fromOmdb(data: Record<string, unknown>): Ratings {
  const out: Ratings = { provider: 'omdb' };
  if (typeof data.imdbID === 'string') out.imdbId = data.imdbID;
  out.imdb = num(data.imdbRating);
  out.imdbVotes = num(data.imdbVotes);
  out.metacritic = num(data.Metascore);
  for (const r of Array.isArray(data.Ratings) ? data.Ratings : []) {
    const { Source, Value } = (r ?? {}) as { Source?: string; Value?: string };
    if (Source === 'Rotten Tomatoes') out.rt = num(Value?.replace('%', ''));
    if (Source === 'Metacritic' && out.metacritic === undefined) out.metacritic = num(Value?.split('/')[0]);
  }
  return out;
}

const json = (status: number, body: unknown, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });

const CACHE_OK = 'public, s-maxage=86400, stale-while-revalidate=604800';

async function imdbIdFromTmdb(tmdbId: string, type: 'movie' | 'tv', tmdbKey: string): Promise<string | undefined> {
  const url = new URL(`https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids`);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (tmdbKey.length > 64) headers.authorization = `Bearer ${tmdbKey}`; else url.searchParams.set('api_key', tmdbKey);
  const res = await fetch(url, { headers });
  if (!res.ok) return undefined;
  const id = (await res.json() as { imdb_id?: string }).imdb_id;
  return id && /^tt\d+$/.test(id) ? id : undefined;
}

export async function handleRatingsRequest(request: Request, keys: RatingsKeys): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
  if (!keys.mdblist && !keys.omdb) return json(503, { error: 'No ratings provider configured (set MDBLIST_API_KEY or OMDB_API_KEY)' });

  const params = new URL(request.url).searchParams;
  const tmdbId = params.get('tmdb');
  const type = params.get('type') as 'movie' | 'tv' | null;
  let imdbId = params.get('imdb') ?? undefined;
  if (tmdbId !== null && !/^\d{1,10}$/.test(tmdbId)) return json(400, { error: 'Bad tmdb id' });
  if (type !== null && type !== 'movie' && type !== 'tv') return json(400, { error: 'Bad type' });
  if (imdbId !== undefined && !/^tt\d{5,10}$/.test(imdbId)) return json(400, { error: 'Bad imdb id' });
  if (!(tmdbId && type) && !imdbId) return json(400, { error: 'Pass tmdb + type, or imdb' });

  try {
    if (keys.mdblist) {
      const url = tmdbId && type
        ? new URL(`https://api.mdblist.com/tmdb/${type === 'tv' ? 'show' : 'movie'}/${tmdbId}`)
        : new URL(`https://api.mdblist.com/imdb/any/${imdbId}`);
      url.searchParams.set('apikey', keys.mdblist);
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (res.ok) return json(200, fromMdblist(await res.json()), CACHE_OK);
      if (!keys.omdb) return json(res.status === 404 ? 404 : 502, { error: 'Ratings unavailable' });
    }
    // OMDb fallback (or the only provider).
    if (!imdbId && tmdbId && type && keys.tmdb) imdbId = await imdbIdFromTmdb(tmdbId, type, keys.tmdb);
    if (!imdbId) return json(404, { error: 'No IMDb id for this title' });
    const url = new URL('https://www.omdbapi.com/');
    url.searchParams.set('i', imdbId);
    url.searchParams.set('apikey', keys.omdb!);
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok || data.Response === 'False') return json(404, { error: 'Ratings unavailable' });
    return json(200, fromOmdb(data), CACHE_OK);
  } catch {
    return json(502, { error: 'Ratings provider unreachable' });
  }
}
