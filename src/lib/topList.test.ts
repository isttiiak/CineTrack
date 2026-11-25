import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./titleData', () => ({
  getDetails: vi.fn(),
  findByImdb: vi.fn(),
  itemFromDetails: (d: { id: number; title?: string }, kind: string) => ({ id: d.id, title: d.title, media_type: kind, poster_path: null, vote_average: 0, overview: '', genre_ids: [], original_language: '' }),
}));
import { findByImdb, getDetails } from './titleData';
import { detailsMatch, fetchTopPage, topPage, topRankLabel, TOP_PAGE_SIZE, type TopListItem } from './topList';

const entry = (rank: number, extra: Partial<TopListItem> = {}): TopListItem => ({ rank, tmdb: 100 + rank, imdb: `tt${1000000 + rank}`, title: `Film ${rank}`, ...extra });
const list = Array.from({ length: 60 }, (_, i) => entry(i + 1));
const details = (id: number, imdb: string) => ({ id, title: `T${id}`, external_ids: { imdb_id: imdb } });

describe('topPage', () => {
  it('slices in order and says when more follows', () => {
    expect(topPage(list, 1).items.map((i) => i.rank)).toEqual(Array.from({ length: TOP_PAGE_SIZE }, (_, i) => i + 1));
    expect(topPage(list, 2).items[0].rank).toBe(TOP_PAGE_SIZE + 1);
    expect(topPage(list, 3)).toMatchObject({ more: false });
    expect(topPage(list, 2).more).toBe(true);
    expect(topPage(list, 9).items).toEqual([]);
  });
  it('labels ranks', () => { expect(topRankLabel(7)).toBe('#7 on IMDb Top 250'); });
});

describe('detailsMatch', () => {
  it('compares the IMDb id', () => {
    expect(detailsMatch({ external_ids: { imdb_id: 'tt1' } }, 'tt1')).toBe(true);
    expect(detailsMatch({ external_ids: { imdb_id: 'tt2' } }, 'tt1')).toBe(false);
    expect(detailsMatch({}, 'tt1')).toBe(false);
    expect(detailsMatch(undefined, 'tt1')).toBe(false);
  });
});

describe('fetchTopPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: list }), { status: 200 })));
    vi.mocked(getDetails).mockReset(); vi.mocked(findByImdb).mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns the cards in rank order with a rank label each', async () => {
    vi.mocked(getDetails).mockImplementation(async (_k, id) => details(id, `tt${1000000 + id - 100}`) as never);
    const r = await fetchTopPage(1);
    expect(r.items).toHaveLength(TOP_PAGE_SIZE);
    expect(r.items[0].id).toBe(101);
    expect(r.reasons[101]).toBe('#1 on IMDb Top 250');
    expect(r.more).toBe(true);
  });

  it("falls back to the IMDb id when the list's TMDB id points at a different title", async () => {
    vi.mocked(getDetails).mockImplementation(async (_k, id) => (id === 101 ? details(101, 'tt9999999') : details(id, `tt${1000000 + id - 100}`)) as never);
    vi.mocked(findByImdb).mockResolvedValue({ id: 555, kind: 'movie', hit: {} as never });
    const r = await fetchTopPage(1);
    expect(findByImdb).toHaveBeenCalledWith('tt1000001');
    expect(r.items[0].id).toBe(555);                    // the film the IMDb id really belongs to, not the list's id 101
  });

  it("falls back to the IMDb id when the list's TMDB id does not exist at TMDB", async () => {
    vi.mocked(getDetails).mockImplementation(async (_k, id) => { if (id === 101) throw new Error('404'); return details(id, `tt${1000000 + id - 100}`) as never; });
    vi.mocked(findByImdb).mockResolvedValue({ id: 555, kind: 'movie', hit: {} as never });
    const r = await fetchTopPage(1);
    expect(findByImdb).toHaveBeenCalledWith('tt1000001');
    expect(r.items).toHaveLength(TOP_PAGE_SIZE);
    expect(r.reasons[555]).toBe('#1 on IMDb Top 250');
  });

  it('skips a title TMDB cannot resolve instead of failing the page', async () => {
    vi.mocked(getDetails).mockImplementation(async (_k, id) => { if (id === 102) throw new Error('boom'); return details(id, `tt${1000000 + id - 100}`) as never; });
    vi.mocked(findByImdb).mockResolvedValue(null);
    const r = await fetchTopPage(1);
    expect(r.items).toHaveLength(TOP_PAGE_SIZE - 1);
    expect(r.items.find((i) => i.id === 102)).toBeUndefined();
  });
});
