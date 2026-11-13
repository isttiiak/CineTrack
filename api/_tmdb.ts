/**
 * TMDB proxy core, shared by the Vercel function (api/tmdb.ts) and the Vite dev/preview server.
 * The browser calls /api/tmdb?path=<endpoint>&<params>; the API key is added here, on the server,
 * so it never ships in the client bundle. Only the endpoints and params the app uses are allowed,
 * so the proxy can't be used as a general-purpose TMDB relay.
 * (Files starting with "_" in api/ are not deployed as functions.)
 */

const ALLOWED_PATHS: RegExp[] = [
  /^search\/(movie|tv|multi)$/,
  /^trending\/all\/week$/,
  /^(movie|tv)\/popular$/,
  /^(movie|tv)\/\d{1,10}$/,
  /^(movie|tv)\/\d{1,10}\/(recommendations|watch\/providers|external_ids)$/,
  /^find\/tt\d{5,10}$/,
  /^discover\/(movie|tv)$/,           // "Coming soon": titles by release date and popularity
];

const APPENDABLE = '(external_ids|watch/providers|recommendations)';

const ALLOWED_PARAMS: Record<string, RegExp> = {
  query: /^.{1,200}$/s,
  year: /^\d{4}$/,
  first_air_date_year: /^\d{4}$/,
  language: /^[a-z]{2}(-[A-Z]{2})?$/,
  page: /^\d{1,3}$/,
  append_to_response: new RegExp(`^${APPENDABLE}(,${APPENDABLE}){0,2}$`),
  external_source: /^imdb_id$/,
  // discover/* filters (all validated; nothing free-form gets through)
  sort_by: /^(popularity|primary_release_date|first_air_date|vote_average|vote_count)\.(asc|desc)$/,
  'primary_release_date.gte': /^\d{4}-\d{2}-\d{2}$/,
  'primary_release_date.lte': /^\d{4}-\d{2}-\d{2}$/,
  'first_air_date.gte': /^\d{4}-\d{2}-\d{2}$/,
  'first_air_date.lte': /^\d{4}-\d{2}-\d{2}$/,
  with_release_type: /^[1-6](\|[1-6]){0,5}$/,
  region: /^[A-Z]{2}$/,
  'vote_count.gte': /^\d{1,6}$/,
};

/** Builds the upstream TMDB URL, or returns null when the request isn't allowed. */
export function buildTmdbUrl(requestUrl: URL): URL | null {
  const path = requestUrl.searchParams.get('path') ?? '';
  if (!ALLOWED_PATHS.some((re) => re.test(path))) return null;
  const out = new URL(`https://api.themoviedb.org/3/${path}`);
  for (const [key, value] of requestUrl.searchParams) {
    if (key === 'path') continue;
    const rule = ALLOWED_PARAMS[key];
    if (!rule || !rule.test(value)) return null;
    out.searchParams.set(key, value);
  }
  return out;
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

/**
 * Accepts either a v3 API key or a v4 read access token (a long JWT, sent as a Bearer header).
 */
export async function handleTmdbRequest(request: Request, credential: string | undefined): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' }, { allow: 'GET' });
  if (!credential) return json(503, { error: 'TMDB is not configured on the server (set TMDB_API_KEY)' });

  const upstream = buildTmdbUrl(new URL(request.url));
  if (!upstream) return json(400, { error: 'Endpoint or parameter not allowed' });

  const headers: Record<string, string> = { accept: 'application/json' };
  if (credential.length > 64) headers.authorization = `Bearer ${credential}`;
  else upstream.searchParams.set('api_key', credential);

  let res: Response;
  try {
    res = await fetch(upstream, { headers });
  } catch {
    return json(502, { error: 'TMDB unreachable' });
  }
  const body = await res.text();
  // Searches change little within an hour, titles/lists within a few; let the CDN absorb repeats.
  const ttl = upstream.pathname.includes('/search/') ? 3600 : 21600;
  return new Response(body, {
    status: res.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': res.ok ? `public, s-maxage=${ttl}, stale-while-revalidate=86400` : 'no-store',
    },
  });
}
