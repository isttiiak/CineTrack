import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTmdbUrl, handleTmdbRequest } from './_tmdb';

const req = (qs: string, method = 'GET') => new Request(`http://localhost/api/tmdb?${qs}`, { method });

describe('buildTmdbUrl', () => {
  it('allows the endpoints the app uses', () => {
    expect(buildTmdbUrl(new URL('http://x/api/tmdb?path=search/movie&query=Dune&year=2021'))?.href)
      .toBe('https://api.themoviedb.org/3/search/movie?query=Dune&year=2021');
    expect(buildTmdbUrl(new URL('http://x/api/tmdb?path=tv/1399&append_to_response=external_ids'))).not.toBeNull();
    expect(buildTmdbUrl(new URL('http://x/api/tmdb?path=trending/all/week&language=en-US'))).not.toBeNull();
    expect(buildTmdbUrl(new URL('http://x/api/tmdb?path=discover/movie&sort_by=popularity.desc&primary_release_date.gte=2026-11-13&with_release_type=2|3'))?.href)
      .toContain('primary_release_date.gte=2026-11-13');
    // Discover search: people, studios, franchises
    expect(buildTmdbUrl(new URL('http://x/api/tmdb?path=person/525/combined_credits&language=en-US'))).not.toBeNull();
    expect(buildTmdbUrl(new URL('http://x/api/tmdb?path=search/company&query=marvel'))).not.toBeNull();
    expect(buildTmdbUrl(new URL('http://x/api/tmdb?path=search/collection&query=star%20wars'))).not.toBeNull();
    expect(buildTmdbUrl(new URL('http://x/api/tmdb?path=collection/10'))).not.toBeNull();
    expect(buildTmdbUrl(new URL('http://x/api/tmdb?path=discover/movie&with_companies=420|7505&sort_by=popularity.desc&vote_count.gte=200'))).not.toBeNull();
  });

  it('rejects other endpoints, traversal and unknown params', () => {
    for (const qs of [
      'path=account',
      'path=movie/1/../../account',
      'path=movie/1/credits',
      'path=search/movie&api_key=stolen',
      'path=search/movie&query=x&callback=evil',
      'path=movie/1&append_to_response=videos',
      'path=discover/movie&sort_by=revenue.desc',
      'path=discover/movie&primary_release_date.gte=tomorrow',
      'path=discover/person',
      'path=discover/movie&with_keywords=1',
      'path=person/525',                         // only the credits endpoint
      'path=person/525/images',
      'path=person/525/combined_credits/../../account',
      'path=search/person&query=x',
      'path=collection/10/images',
      'path=discover/movie&with_companies=420;drop',
      'path=discover/movie&with_companies=a',
    ]) expect(buildTmdbUrl(new URL(`http://x/api/tmdb?${qs}`)), qs).toBeNull();
  });
});

describe('handleTmdbRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds the key server-side and never echoes it', async () => {
    const fetchMock = vi.fn(async () => new Response('{"results":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleTmdbRequest(req('path=search/movie&query=Dune'), 'secret123');
    expect(res.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(String(url)).toContain('api_key=secret123');
    expect(res.headers.get('cache-control')).toContain('s-maxage');
    expect(await res.text()).not.toContain('secret123');
  });

  it('sends long v4 tokens as a Bearer header', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const token = 'x'.repeat(200);
    await handleTmdbRequest(req('path=movie/550'), token);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, { headers: Record<string, string> }];
    expect(String(url)).not.toContain('api_key');
    expect(init.headers.authorization).toBe(`Bearer ${token}`);
  });

  it('rejects bad requests before calling TMDB', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await handleTmdbRequest(req('path=account'), 'k')).status).toBe(400);
    expect((await handleTmdbRequest(req('path=movie/1', 'POST'), 'k')).status).toBe(405);
    expect((await handleTmdbRequest(req('path=movie/1'), undefined)).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
