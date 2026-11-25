import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTopListMemory, DEFAULT_LIST, handleTopListRequest, listPath, parseTopList } from './_toplist';

const film = (rank: number, extra: Record<string, unknown> = {}) => ({
  id: 1000 + rank, rank, title: `Film ${rank}`, imdb_id: `tt${String(1000000 + rank)}`, release_year: 1990 + (rank % 30), mediatype: 'movie', ...extra,
});
const list = (n: number) => ({ movies: Array.from({ length: n }, (_, i) => film(i + 1)), shows: [], pagination: {} });
const req = (method = 'GET') => new Request('http://localhost/api/toplist', { method });

describe('listPath', () => {
  it('accepts user/slug and falls back otherwise', () => {
    expect(listPath('someone/imdb-top-250')).toBe('someone/imdb-top-250');
    expect(listPath(undefined)).toBe(DEFAULT_LIST);
    expect(listPath('../../lists/user')).toBe(DEFAULT_LIST);
    expect(listPath('a/b?apikey=x')).toBe(DEFAULT_LIST);
    expect(listPath('only-one-part')).toBe(DEFAULT_LIST);
  });
});

describe('parseTopList', () => {
  it('maps films in rank order', () => {
    const items = parseTopList({ movies: [film(2), film(1)] });
    expect(items.map((i) => i.rank)).toEqual([1, 2]);
    expect(items[0]).toEqual({ rank: 1, tmdb: 1001, imdb: 'tt1000001', title: 'Film 1', year: 1991 });
  });

  it('prefers ids.tmdb over id', () => {
    expect(parseTopList({ movies: [film(1, { ids: { tmdb: 278 } })] })[0].tmdb).toBe(278);
  });

  it('drops rows without a valid IMDb id, repeats and non-films; falls back to position when rank is missing', () => {
    const items = parseTopList({ movies: [
      film(1), film(1), film(2, { imdb_id: 'nope' }), film(3, { imdb_id: undefined }), film(4, { mediatype: 'show' }),
      { title: 'No rank', imdb_id: 'tt9999999' },
    ] });
    expect(items.map((i) => i.imdb)).toEqual(['tt1000001', 'tt9999999']);
    expect(items[1].rank).toBe(6);
  });

  it('survives junk and caps the length', () => {
    expect(parseTopList(null)).toEqual([]);
    expect(parseTopList({ movies: 'x' })).toEqual([]);
    expect(parseTopList({ movies: [null, 5, 'a'] })).toEqual([]);
    expect(parseTopList(list(400))).toHaveLength(250);
  });
});

describe('handleTopListRequest', () => {
  beforeEach(() => clearTopListMemory());
  afterEach(() => vi.unstubAllGlobals());

  it('rejects other methods and a missing key', async () => {
    expect((await handleTopListRequest(req('POST'), { mdblist: 'k' })).status).toBe(405);
    expect((await handleTopListRequest(req(), {})).status).toBe(503);
  });

  it('asks MDBList for the configured list with the key, and caches the answer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(list(250)), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleTopListRequest(req(), { mdblist: 'secret', list: 'someone/top' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('s-maxage=86400');
    expect((await res.json() as { items: unknown[] }).items).toHaveLength(250);
    const url = new URL((fetchMock.mock.calls[0] as unknown as [URL])[0]);
    expect(url.pathname).toBe('/lists/someone/top/items');
    expect(url.searchParams.get('apikey')).toBe('secret');
    expect(url.searchParams.get('mediatype')).toBe('movie');
    await handleTopListRequest(req(), { mdblist: 'secret', list: 'someone/top' });
    expect(fetchMock).toHaveBeenCalledTimes(1);          // the second one came from memory
  });

  it('never puts the key in the response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(list(250)), { status: 200 })));
    const text = await (await handleTopListRequest(req(), { mdblist: 'secret-key-123' })).text();
    expect(text).not.toContain('secret-key-123');
  });

  it('reports quota and outages without caching them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Daily API limit exceeded!"}', { status: 429 })));
    const limited = await handleTopListRequest(req(), { mdblist: 'k' });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('cache-control')).toBe('no-store');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await handleTopListRequest(req(), { mdblist: 'k' })).status).toBe(502);
  });

  it('refuses a list that came back nearly empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(list(3)), { status: 200 })));
    expect((await handleTopListRequest(req(), { mdblist: 'k' })).status).toBe(502);
  });
});
