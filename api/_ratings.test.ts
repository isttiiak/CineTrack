import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromMdblist, fromOmdb, handleRatingsRequest } from './_ratings';

const req = (qs: string) => new Request(`http://localhost/api/ratings?${qs}`);

describe('normalising providers', () => {
  it('maps MDBList ratings', () => {
    const r = fromMdblist({
      imdb_id: 'tt1375666',
      ratings: [
        { source: 'imdb', value: 8.8, score: 88, votes: 2600000 },
        { source: 'tomatoes', value: 87, score: 87 },
        { source: 'popcorn', value: 91, score: 91 },
        { source: 'metacritic', value: 74, score: 74 },
        { source: 'letterboxd', value: 4.2, score: 84 },
        { source: 'tmdb', value: 84, score: 84 },
        { source: 'trakt', value: null, score: null },
      ],
    });
    expect(r).toMatchObject({ provider: 'mdblist', imdbId: 'tt1375666', imdb: 8.8, imdbVotes: 2600000, rt: 87, rtAudience: 91, metacritic: 74, letterboxd: 4.2, tmdb: 8.4 });
    expect(r.trakt).toBeUndefined();
  });

  it('maps OMDb ratings', () => {
    const r = fromOmdb({
      imdbID: 'tt1375666', imdbRating: '8.8', imdbVotes: '2,600,000', Metascore: '74',
      Ratings: [{ Source: 'Internet Movie Database', Value: '8.8/10' }, { Source: 'Rotten Tomatoes', Value: '87%' }, { Source: 'Metacritic', Value: '74/100' }],
    });
    expect(r).toMatchObject({ provider: 'omdb', imdb: 8.8, imdbVotes: 2600000, rt: 87, metacritic: 74 });
  });

  it('ignores N/A values', () => {
    expect(fromOmdb({ imdbRating: 'N/A', Metascore: 'N/A' })).toEqual({ provider: 'omdb', imdb: undefined, imdbVotes: undefined, metacritic: undefined });
  });
});

describe('handleRatingsRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('validates input and needs a provider key', async () => {
    expect((await handleRatingsRequest(req('tmdb=1&type=movie'), {})).status).toBe(503);
    expect((await handleRatingsRequest(req('tmdb=abc&type=movie'), { mdblist: 'k' })).status).toBe(400);
    expect((await handleRatingsRequest(req('tmdb=1&type=person'), { mdblist: 'k' })).status).toBe(400);
    expect((await handleRatingsRequest(req('imdb=../x'), { mdblist: 'k' })).status).toBe(400);
  });

  it('queries MDBList by TMDB id with the key server-side, and caches', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ imdb_id: 'tt1', ratings: [{ source: 'imdb', value: 7.1 }] })));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleRatingsRequest(req('tmdb=1399&type=tv'), { mdblist: 'secret' });
    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(String(url)).toBe('https://api.mdblist.com/tmdb/show/1399?apikey=secret');
    expect(res.headers.get('cache-control')).toContain('s-maxage=86400');
    const body = await res.text();
    expect(body).not.toContain('secret');
    expect(JSON.parse(body).imdb).toBe(7.1);
  });

  it('falls back to OMDb via the IMDb id from TMDB', async () => {
    const fetchMock = vi.fn(async (u: URL) => String(u).includes('themoviedb')
      ? new Response(JSON.stringify({ imdb_id: 'tt1375666' }))
      : new Response(JSON.stringify({ imdbID: 'tt1375666', imdbRating: '8.8', Response: 'True' })));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleRatingsRequest(req('tmdb=27205&type=movie'), { omdb: 'o', tmdb: 't' });
    expect(res.status).toBe(200);
    expect(String((fetchMock.mock.calls[1] as unknown as [URL])[0])).toContain('omdbapi.com/?i=tt1375666');
  });
});
