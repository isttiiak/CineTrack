import { afterEach, describe, expect, it, vi } from 'vitest';
import { fallbackQueries, rankItems, relevanceTier, searchDiscover, pickPerson, personShouldLead, filmographyFrom, pickCompany, pickCollection } from './discoverSearch';

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

describe('smart groups', () => {
  const credit = (id: number, over: Record<string, unknown> = {}) =>
    ({ id, title: `T${id}`, media_type: 'movie', poster_path: null, vote_average: 7, overview: '', genre_ids: [], original_language: 'en', popularity: 10, vote_count: 1000, ...over }) as never;

  it('matches people by name prefix, most popular first', () => {
    const people = [
      { id: 19508, name: 'Nolan North', popularity: 2, known_for_department: 'Acting' },
      { id: 525, name: 'Christopher Nolan', popularity: 9.3, known_for_department: 'Directing' },
      { id: 527, name: 'Jonathan Nolan', popularity: 2.3, known_for_department: 'Writing' },
    ];
    expect(pickPerson('nolan', people)?.id).toBe(525);
    expect(pickPerson('chris nol', people)?.id).toBe(525);
    expect(pickPerson('oppenheimer', people)).toBeNull();
    expect(pickPerson('no', people)).toBeNull();                 // too short to mean a person
    expect(pickPerson('nolan', [{ id: 1, name: 'Nolan Obscure', popularity: 0.5 }])).toBeNull();
  });

  it('lets a person lead only when no title is a strong match or the person is far better known', () => {
    expect(personShouldLead(9, null)).toBe(true);
    expect(personShouldLead(9, { tier: 2, popularity: 100 })).toBe(true);        // weak title match
    expect(personShouldLead(40, { tier: 5, popularity: 50 })).toBe(false);       // "tom" vs "Tom & Jerry"
    expect(personShouldLead(90, { tier: 4, popularity: 20 })).toBe(true);        // "nolan" vs "Nolan Ryan"
  });

  it('keeps a director\'s real films, not shorts, and de-duplicates', () => {
    const credits = {
      crew: [
        credit(1, { job: 'Director' }),
        credit(2, { job: 'Director', vote_count: 8 }),             // a short
        credit(3, { job: 'Producer' }),                            // not directing
        credit(1, { job: 'Director' }),                            // duplicate
        credit(4, { job: 'Director', popularity: 99 }),
      ],
      cast: [credit(9)],
    };
    expect(filmographyFrom(credits, 'Directing').map((i) => i.id)).toEqual([4, 1]);
  });

  it('keeps an actor\'s main roles, not talk shows, cameos or "Self"', () => {
    const credits = {
      cast: [
        credit(1, { character: 'Hero', order: 0 }),
        credit(2, { character: 'Self', order: 0 }),
        credit(3, { character: 'Host', order: 0, genre_ids: [10767] }),
        credit(4, { character: 'Bystander', order: 40 }),
        credit(5, { character: 'Friend', order: 3, vote_count: 50 }),
        credit(6, { character: 'Lead', order: 1, media_type: 'tv' }),
      ],
    };
    expect(filmographyFrom(credits, 'Acting').map((i) => i.id).sort()).toEqual([1, 6]);
  });

  it('uses curated aliases for split studios and exact/first-word names otherwise', () => {
    expect(pickCompany('marvel', [])?.ids).toEqual([420, 7505]);
    expect(pickCompany('MCU', [])?.ids).toEqual([420, 7505]);
    expect(pickCompany('pixar', [{ id: 3, name: 'Pixar' }, { id: 219390, name: 'Pixar Canada' }])?.ids).toEqual([3]);
    expect(pickCompany('a24', [{ id: 293354, name: 'A24' }, { id: 41077, name: 'A24' }, { id: 279130, name: 'A25' }])?.ids).toEqual([293354, 41077]);   // same name twice: use both
    expect(pickCompany('love', [{ id: 269630, name: 'K-LOVE' }, { id: 118743, name: 'Love Trouble' }])?.ids).toEqual([118743]);
    expect(pickCompany('dun', [{ id: 1, name: 'Dune Productions' }])).toBeNull();     // must be whole words
  });

  it('picks only a franchise whose name is the query, not spin-offs or prefix matches', () => {
    const hits = [{ id: 302331, name: 'LEGO Star Wars Collection' }, { id: 10, name: 'Star Wars Collection' }];
    expect(pickCollection('star wars', hits)?.id).toBe(10);
    expect(pickCollection('avengers', [{ id: 86311, name: 'The Avengers Collection' }])?.id).toBe(86311);
    expect(pickCollection('the avengers', [{ id: 86311, name: 'The Avengers Collection' }])?.id).toBe(86311);
    expect(pickCollection('marvel', [{ id: 1, name: 'Marvel Rising Collection' }])).toBeNull();
    expect(pickCollection('tom', [{ id: 2, name: 'Tom Lepski Collection' }])).toBeNull();
    expect(pickCollection('wars', hits)).toBeNull();
  });
});
