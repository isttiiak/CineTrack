import { afterEach, describe, expect, it, vi } from 'vitest';
import { fallbackQueries, rankItems, relevanceTier, searchDiscover } from './discoverSearch';

const item = (id: number, title: string, popularity: number, vote_count = 1000, extra: Record<string, unknown> = {}) =>
  ({ id, title, media_type: 'movie' as const, popularity, vote_count, vote_average: 7, poster_path: null, overview: '', genre_ids: [], original_language: 'en', release_date: '2020-01-01', ...extra });

describe('relevanceTier', () => {
  it('orders exact > starts with > all words > word prefixes > typo > other', () => {
    expect(relevanceTier('dune', { title: 'Dune' })).toBe(5);
    expect(relevanceTier('dune', { title: 'Dune: Part Two' })).toBe(4);
    expect(relevanceTier('part dune', { title: 'Dune: Part Two' })).toBe(3);
    expect(relevanceTier('du pa', { title: 'Dune: Part Two' })).toBe(2);
    expect(relevanceTier('oppenhiemer', { title: 'Oppenheimer' })).toBe(1);
    expect(relevanceTier('dune', { title: 'Arrakis' })).toBe(0);
  });

  it('uses the original title too and ignores accents', () => {
    expect(relevanceTier('shogun', { title: 'Shōgun' })).toBe(5);
    expect(relevanceTier('parasite', { title: 'Gisaengchung', original_title: 'Parasite' })).toBe(5);
  });
});

describe('rankItems', () => {
  it('puts better matches first, then the more popular title', () => {
    const ranked = rankItems('dune', [
      item(1, 'Dune Drifter', 900),
      item(2, 'Dune', 20, 1500, { release_date: '1984-12-14' }),
      item(3, 'Dune', 150, 15000, { release_date: '2021-09-15' }),
      item(4, 'Dune: Part Two', 400, 9000),
    ]);
    expect(ranked.map((r) => r.id)).toEqual([3, 2, 4, 1]);   // exact titles by popularity, then "starts with" by popularity + votes
  });

  it('does not let a hyped title with few votes beat a classic', () => {
    const ranked = rankItems('heat', [item(1, 'Heat', 500, 10), item(2, 'Heat', 60, 7000)]);
    expect(ranked[0].id).toBe(2);
  });
});

describe('fallbackQueries', () => {
  it('shortens long words for typo recovery and skips numbers', () => {
    expect(fallbackQueries('oppenhiemer')).toEqual(['oppenh']);
    expect(fallbackQueries('the intersteller')).toEqual(['inters']);
    expect(fallbackQueries('2049')).toEqual([]);
  });
});

describe('searchDiscover', () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (byQuery: Record<string, unknown[]>) => vi.fn(async (url: string) => {
    const q = new URL(url, 'http://x').searchParams.get('query') ?? '';
    return new Response(JSON.stringify({ results: byQuery[q] ?? [] }));
  });

  it('recovers from typos and reports the correction', async () => {
    vi.stubGlobal('fetch', respond({
      oppenhiemer: [],
      oppenh: [item(1, 'Oppenheimer', 80, 9000), item(2, 'Oppenheim', 1, 3)],
    }));
    const r = await searchDiscover('oppenhiemer');
    expect(r.items[0].title).toBe('Oppenheimer');
    expect(r.correctedTo).toBe('Oppenheimer');
  });

  it('adds titles a searched person is known for', async () => {
    vi.stubGlobal('fetch', respond({
      nolan: [{ id: 9, media_type: 'person', name: 'Christopher Nolan', popularity: 20, known_for: [item(5, 'Inception', 90, 30000), item(6, 'Interstellar', 95, 33000)] }],
    }));
    const r = await searchDiscover('nolan');
    expect(r.items.map((i) => i.id)).toEqual([6, 5]);
    expect(r.reasons[5]).toBe('Known for: Christopher Nolan');
  });

  it('applies year, type and rating filters', async () => {
    vi.stubGlobal('fetch', respond({
      dune: [
        item(1, 'Dune', 100, 9000, { release_date: '2021-09-15', vote_average: 7.8 }),
        item(2, 'Dune', 20, 1500, { release_date: '1984-12-14', vote_average: 6.3 }),
        { ...item(3, 'Dune', 10, 100, { first_air_date: '2000-12-03' }), media_type: 'tv', name: 'Dune', title: undefined },
      ],
    }));
    expect((await searchDiscover('dune year:1984')).items.map((i) => i.id)).toEqual([2]);
    expect((await searchDiscover('dune rating>7')).items.map((i) => i.id)).toEqual([1]);
  });
});
