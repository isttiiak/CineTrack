import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENRE_NAMES } from '../../api/_ai';
import {
  buildDiscoverParams, executePlan, genreIdsFor, GENRE_IDS, matchesPlan, planChips, rankForPlan,
  type AiPlan, type ResolvedNames,
} from './aiSearch';
import type { TMDBItem } from '../hooks/useTMDBDiscover';

const plan = (over: Partial<AiPlan> = {}): AiPlan => ({ type: 'any', genres: [], people: [], companies: [], keywords: [], sort: 'popularity', summary: '', ...over });
const none: ResolvedNames = { people: [], companyIds: [], companyLabels: [], keywordIds: [], genreKeywordIds: [], unresolved: [] };
const item = (id: number, over: Partial<TMDBItem> = {}): TMDBItem =>
  ({ id, title: `T${id}`, media_type: 'movie', poster_path: null, vote_average: 7, overview: '', genre_ids: [], original_language: 'en', release_date: '2015-01-01', popularity: 10, vote_count: 1000, ...over });

describe('genres', () => {
  it('knows every genre the server can return', () => {
    for (const g of GENRE_NAMES) expect(GENRE_IDS[g], g).toBeDefined();
  });
  it('uses separate ids for series and reports genres a series does not have', () => {
    expect(genreIdsFor('movie', ['Sci-Fi', 'Action'])).toEqual({ ids: [878, 28], missing: [] });
    expect(genreIdsFor('tv', ['Sci-Fi', 'Action', 'Adventure'])).toEqual({ ids: [10765, 10759], missing: [] });   // Action + Adventure share an id
    expect(genreIdsFor('tv', ['Horror', 'Drama'])).toEqual({ ids: [18], missing: ['Horror'] });
  });
});

describe('buildDiscoverParams', () => {
  it('builds a film query with every filter', () => {
    const p = plan({ type: 'movie', genres: ['Horror'], country: 'KR', language: 'ko', yearFrom: 2010, yearTo: 2019, minRating: 7, sort: 'rating' });
    expect(buildDiscoverParams('movie', p, { ...none, companyIds: [3], keywordIds: [10, 11] }, '2026-11-15')).toEqual({
      language: 'en-US', sort_by: 'vote_average.desc', 'vote_count.gte': '300', with_genres: '27', with_companies: '3',
      with_keywords: '10|11', with_origin_country: 'KR', with_original_language: 'ko', 'vote_average.gte': '7',
      'primary_release_date.gte': '2010-01-01', 'primary_release_date.lte': '2019-12-31',
    });
  });
  it('uses series date fields and ids, and caps "newest" at today', () => {
    const p = plan({ type: 'tv', genres: ['Drama'], sort: 'newest', yearFrom: 2020 });
    expect(buildDiscoverParams('tv', p, none, '2026-11-15')).toMatchObject({
      with_genres: '18', sort_by: 'first_air_date.desc', 'first_air_date.gte': '2020-01-01', 'first_air_date.lte': '2026-11-15',
    });
  });
  it('skips series it cannot express, unless a keyword stands in for the genre', () => {
    const p = plan({ genres: ['Horror'] });
    expect(buildDiscoverParams('tv', p, none, '2026-11-15')).toBeNull();
    expect(buildDiscoverParams('tv', p, { ...none, genreKeywordIds: [315058] }, '2026-11-15')).toMatchObject({ with_keywords: '315058' });
  });
  it('filters films by person but leaves series to the credits path', () => {
    const r = { ...none, people: [{ id: 525, name: 'Christopher Nolan' }] };
    expect(buildDiscoverParams('movie', plan({ people: ['Nolan'] }), r, '2026-11-15')).toMatchObject({ with_people: '525', 'vote_count.gte': '50' });
    expect(buildDiscoverParams('tv', plan({ people: ['Nolan'] }), r, '2026-11-15')).toBeNull();
  });
  it('only produces values the TMDB proxy accepts', async () => {
    const { buildTmdbUrl } = await import('../../api/_tmdb');
    const p = plan({ type: 'movie', genres: ['Horror', 'Thriller'], country: 'KR', language: 'ko', yearFrom: 2010, yearTo: 2019, minRating: 7.5, sort: 'newest' });
    const params = buildDiscoverParams('movie', p, { ...none, people: [{ id: 1, name: 'x' }], companyIds: [3, 4], keywordIds: [5, 6] }, '2026-11-15')!;
    const url = new URL('http://x/api/tmdb');
    url.searchParams.set('path', 'discover/movie');
    for (const [k, v] of Object.entries({ ...params, page: '2' })) url.searchParams.set(k, v);
    expect(buildTmdbUrl(url)).not.toBeNull();
  });
});

describe('matchesPlan / rankForPlan / planChips', () => {
  it('judges results by their own fields', () => {
    const p = plan({ type: 'movie', genres: ['Horror'], yearFrom: 2010, yearTo: 2019, minRating: 7, language: 'ko' });
    const good = item(1, { genre_ids: [27, 53], original_language: 'ko', vote_average: 7.4 });
    expect(matchesPlan(good, p)).toBe(true);
    expect(matchesPlan({ ...good, genre_ids: [35] }, p)).toBe(false);
    expect(matchesPlan({ ...good, release_date: '2021-01-01' }, p)).toBe(false);
    expect(matchesPlan({ ...good, vote_average: 6 }, p)).toBe(false);
    expect(matchesPlan({ ...good, original_language: 'en' }, p)).toBe(false);
    expect(matchesPlan({ ...good, media_type: 'tv', first_air_date: '2015-01-01' }, p)).toBe(false);   // asked for films
  });
  it('orders by the requested sort', () => {
    const list = [item(1, { vote_average: 6, release_date: '2020-01-01' }), item(2, { vote_average: 9, release_date: '2010-01-01' }), item(3, { vote_average: 8, release_date: '2024-01-01' })];
    expect(rankForPlan(list, 'rating').map((i) => i.id)).toEqual([2, 3, 1]);
    expect(rankForPlan(list, 'newest').map((i) => i.id)).toEqual([3, 1, 2]);
    expect(rankForPlan(list, 'oldest').map((i) => i.id)).toEqual([2, 1, 3]);
  });
  it('describes the interpretation in plain words', () => {
    const chips = planChips(plan({ type: 'movie', genres: ['Horror'], country: 'KR', yearFrom: 2010, yearTo: 2019, minRating: 7, sort: 'rating', similarTo: 'Oldboy', keywords: ['revenge'] }),
      { ...none, people: [{ id: 1, name: 'Bong Joon Ho' }], companyLabels: ['CJ Entertainment'] });
    expect(chips).toEqual(['Movies', 'Horror', '2010–2019', 'South Korea', 'Bong Joon Ho', 'CJ Entertainment', 'revenge', 'rated 7+', 'like Oldboy', 'top rated']);
  });
});

describe('executePlan', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Fakes /api/tmdb by path. */
  const stubTmdb = (handlers: Record<string, (q: URLSearchParams) => unknown>) => {
    const calls: URLSearchParams[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const qs = new URL(url, 'http://x').searchParams;
      calls.push(qs);
      const h = handlers[qs.get('path') ?? ''];
      return new Response(JSON.stringify(h ? h(qs) : { results: [] }), { status: 200 });
    }));
    return calls;
  };

  it('resolves names, queries discover and reports what could not be found', async () => {
    const calls = stubTmdb({
      'search/keyword': () => ({ results: [{ id: 4379, name: 'time travel' }] }),
      'search/person': (q) => ({ results: q.get('query') === 'Nobody Real' ? [] : [{ id: 525, name: 'Christopher Nolan', popularity: 9, known_for_department: 'Directing' }] }),
      'discover/movie': () => ({ results: [item(1, { media_type: undefined as never }), item(2, { media_type: undefined as never, popularity: 50 })] }),
    });
    const result = await executePlan(plan({ type: 'movie', genres: ['Sci-Fi'], people: ['Christopher Nolan', 'Nobody Real'], keywords: ['time travel'], summary: 's' }), undefined, '2026-11-15');
    const discover = calls.filter((c) => c.get('path') === 'discover/movie');
    expect(discover).toHaveLength(2);                                                   // one film kind: two pages
    expect(discover[0].get('with_people')).toBe('525');
    expect(discover[0].get('with_keywords')).toBe('4379');
    expect(discover[0].get('with_genres')).toBe('878');
    expect(result.items.every((i) => i.media_type === 'movie')).toBe(true);
    expect(result.items.map((i) => i.id)).toEqual([2, 1]);                              // popularity order, de-duplicated across pages
    expect(result.notes).toEqual(['Couldn\'t find “Nobody Real”']);
    expect(result.chips).toContain('Christopher Nolan');
  });

  it('answers "like X" from recommendations and keeps the seed out', async () => {
    stubTmdb({
      // the 2013 remake is listed first, the original is far better known: the original is the seed
      'search/multi': () => ({ results: [{ id: 1, media_type: 'movie', title: 'Oldboy', popularity: 4, vote_count: 900 }, { id: 670, media_type: 'movie', title: 'Oldboy', popularity: 30, vote_count: 5000 }] }),
      '/': () => ({}),
      'movie/670/recommendations': () => ({ results: [item(11, { release_date: '2019-01-01' }), item(12, { release_date: '2003-01-01' })] }),
    });
    const result = await executePlan(plan({ type: 'movie', similarTo: 'Oldboy', yearFrom: 2010 }), undefined, '2026-11-15');
    expect(result.items.map((i) => i.id)).toEqual([11]);                                // 2003 fails the year filter
    expect(result.chips).toContain('like Oldboy');
  });

  it('applies the requested order to recommendations too', async () => {
    stubTmdb({
      'search/multi': () => ({ results: [{ id: 670, media_type: 'movie', title: 'Oldboy', popularity: 30, vote_count: 5000 }] }),
      'movie/670/recommendations': () => ({ results: [item(11, { release_date: '2012-01-01' }), item(12, { release_date: '2022-01-01' })] }),
    });
    const result = await executePlan(plan({ type: 'movie', similarTo: 'Oldboy', sort: 'newest' }), undefined, '2026-11-15');
    expect(result.items.map((i) => i.id)).toEqual([12, 11]);
  });

  it('does nothing for a plan whose only filters failed to resolve', async () => {
    const calls = stubTmdb({});
    const result = await executePlan(plan({ type: 'movie', people: ['Nobody Real'] }), undefined, '2026-11-15');
    expect(result.items).toEqual([]);
    expect(calls.some((c) => c.get('path')?.startsWith('discover'))).toBe(false);
    expect(result.notes).toEqual(['Couldn\'t find “Nobody Real”']);
  });

  it('uses a person\'s credits for series, since discover has no people filter', async () => {
    stubTmdb({
      'search/person': () => ({ results: [{ id: 66633, name: 'Vince Gilligan', popularity: 5, known_for_department: 'Writing' }] }),
      'person/66633/combined_credits': () => ({ crew: [
        item(1396, { media_type: 'tv', job: 'Creator', first_air_date: '2008-01-20', release_date: undefined, genre_ids: [18], vote_count: 15000 } as never),
        item(60059, { media_type: 'tv', job: 'Creator', first_air_date: '2015-02-08', release_date: undefined, genre_ids: [18], vote_count: 9000 } as never),
        item(9, { media_type: 'movie', job: 'Writer', vote_count: 4000 } as never),
      ] }),
    });
    const result = await executePlan(plan({ type: 'tv', people: ['Vince Gilligan'], genres: ['Drama'] }), undefined, '2026-11-15');
    expect(result.items.map((i) => i.id).sort()).toEqual([1396, 60059]);
  });
});
