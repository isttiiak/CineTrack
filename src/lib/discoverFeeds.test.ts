import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTmdbUrl } from '../../api/_tmdb';

const tmdbMock = vi.hoisted(() => vi.fn());
vi.mock('./tmdb', () => ({ tmdb: tmdbMock }));

import {
  canLoadMore, comingSoonWindow, COMING_SOON_PAGES, eraStart, feedRequest, fetchComingSoonPage, MAX_PAGES,
  mergePage, normalizeFeedItems, pullNextPage,
} from './discoverFeeds';

const TODAY = '2026-11-25';
interface Row { id: number; media_type: 'movie' | 'tv'; title?: string; name?: string }
const m = (id: number): Row => ({ id, media_type: 'movie', title: `M${id}` });
const t = (id: number): Row => ({ id, media_type: 'tv', name: `T${id}` });

describe('mergePage', () => {
  it('appends new titles in order and drops repeats', () => {
    expect(mergePage([m(1), m(2)], [m(2), m(3), m(1), m(4)]).map((i) => i.id)).toEqual([1, 2, 3, 4]);
  });
  it('treats a film and a series with the same id as different titles', () => {
    expect(mergePage([m(5)], [t(5)])).toHaveLength(2);
  });
  it('drops repeats inside one page and returns the same array when nothing is new', () => {
    const shown = [m(1)];
    expect(mergePage([], [m(1), m(1), m(2)]).map((i) => i.id)).toEqual([1, 2]);
    expect(mergePage(shown, [m(1)])).toBe(shown);
  });
  it('keeps earlier items where they were (no reshuffling under the reader)', () => {
    const shown = [m(3), m(1)];
    expect(mergePage(shown, [m(2), m(3)]).map((i) => i.id)).toEqual([3, 1, 2]);
  });
});

describe('canLoadMore', () => {
  it('stops at the last page TMDB has, at its 500-page limit and at our own cap', () => {
    expect(canLoadMore(1, 30)).toBe(true);
    expect(canLoadMore(30, 30)).toBe(false);
    expect(canLoadMore(1, 1)).toBe(false);
    expect(canLoadMore(MAX_PAGES - 1, 1000)).toBe(true);
    expect(canLoadMore(MAX_PAGES, 1000)).toBe(false);
    expect(canLoadMore(500, 10_000, 9999)).toBe(false);
    expect(canLoadMore(0, 10)).toBe(false);
  });
});

describe('feedRequest', () => {
  it('movies: released up to today, inside the window, most popular first, above a vote floor', () => {
    const r = feedRequest('movies', 'recent', 3, TODAY);
    expect(r.path).toBe('discover/movie');
    expect(r.params).toMatchObject({ page: '3', sort_by: 'popularity.desc', 'primary_release_date.lte': TODAY, 'vote_count.gte': '100' });
    expect(r.params['primary_release_date.gte']).toBe(eraStart('movies', 'recent', TODAY));
    expect(eraStart('movies', 'recent', TODAY) > '2025-01-01').toBe(true);          // roughly 18 months, not years
  });
  it('series use first-air dates and a longer window than films', () => {
    const r = feedRequest('tv', 'recent', 1, TODAY);
    expect(r.path).toBe('discover/tv');
    expect(r.params['first_air_date.lte']).toBe(TODAY);
    expect(eraStart('tv', 'recent', TODAY) < eraStart('movies', 'recent', TODAY)).toBe(true);
  });
  it('older eras widen the window and raise the vote floor; all time has no start date', () => {
    expect(feedRequest('movies', 'five', 1, TODAY).params['primary_release_date.gte']).toBe('2021-11-25');
    expect(Number(feedRequest('movies', 'five', 1, TODAY).params['vote_count.gte'])).toBeGreaterThan(100);
    const all = feedRequest('tv', 'all', 1, TODAY);
    expect(all.params).not.toHaveProperty('first_air_date.gte');
    expect(all.params['first_air_date.lte']).toBe(TODAY);                              // still never unreleased
  });
  it('trending is TMDB\'s own weekly list, paged', () => {
    expect(feedRequest('trending', 'recent', 4, TODAY)).toEqual({ path: 'trending/all/week', params: { language: 'en-US', page: '4' } });
  });
  it('only asks for things the proxy allows', () => {
    for (const tab of ['trending', 'movies', 'tv'] as const) {
      for (const era of ['recent', 'five', 'all'] as const) {
        const r = feedRequest(tab, era, 7, TODAY);
        const url = new URL('http://x/api/tmdb');
        url.searchParams.set('path', r.path);
        for (const [k, v] of Object.entries(r.params)) url.searchParams.set(k, v);
        expect(buildTmdbUrl(url), `${tab}/${era}`).not.toBeNull();
      }
    }
  });
});

describe('normalizeFeedItems', () => {
  it('adds the media type that discover lists leave out and drops people and untitled rows', () => {
    const out = normalizeFeedItems([{ id: 1, title: 'A' }, { id: 2, name: 'B', media_type: 'person' }, { id: 3 }, { id: 4, name: 'C', media_type: 'tv' }], 'movies');
    expect(out.map((i) => [i.id, i.media_type])).toEqual([[1, 'movie'], [4, 'tv']]);
    expect(normalizeFeedItems([{ id: 9, name: 'S' }], 'tv')[0].media_type).toBe('tv');
    expect(normalizeFeedItems(undefined, 'tv')).toEqual([]);
  });
});

describe('pullNextPage', () => {
  it('appends the next page and moves on', async () => {
    const fetchPage = vi.fn(async (p: number) => ({ items: [m(p * 10)], more: p < 3 }));
    const r = await pullNextPage([m(1)], 2, fetchPage);
    expect(r.items.map((i) => i.id)).toEqual([1, 20]);
    expect(r).toMatchObject({ page: 3, more: true });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
  it('keeps going when a page only repeats what is shown, but not forever', async () => {
    const pages: Record<number, Row[]> = { 2: [m(1)], 3: [m(1), m(2)], 4: [m(9)] };
    const fetchPage = vi.fn(async (p: number) => ({ items: pages[p] ?? [], more: true }));
    const r = await pullNextPage([m(1)], 2, fetchPage);
    expect(r.items.map((i) => i.id)).toEqual([1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(2);

    const stuck = vi.fn(async () => ({ items: [m(1)], more: true }));
    await pullNextPage([m(1)], 2, stuck, 3);
    expect(stuck).toHaveBeenCalledTimes(4);                                            // the first try plus three more
  });
  it('stops at the end of the list and follows a page the source says to skip to', async () => {
    const end = await pullNextPage([m(1)], 2, async () => ({ items: [], more: false }));
    expect(end).toMatchObject({ items: [m(1)], more: false });
    const jump = await pullNextPage([], 2, async (p) => ({ items: [m(p)], more: true, nextPage: p + 3 }));
    expect(jump.page).toBe(5);
  });
  it('lets a failing page throw (the hook shows "Try again" and keeps what is shown)', async () => {
    await expect(pullNextPage([m(1)], 2, async () => { throw new Error('TMDB 500'); })).rejects.toThrow('TMDB 500');
  });
});

describe('Coming soon, a month per page', () => {
  beforeEach(() => tmdbMock.mockReset());

  it('windows are 30 days, back to back, the first starting today', () => {
    expect(comingSoonWindow(1, TODAY)).toEqual({ from: '2026-11-25', to: '2026-12-24' });
    expect(comingSoonWindow(2, TODAY)).toEqual({ from: '2026-12-25', to: '2027-01-23' });
  });

  const release = (id: number, date: string, popularity: number) => ({ id, title: `M${id}`, poster_path: '/p.jpg', release_date: date, popularity });
  const respond = (movies: unknown[], shows: unknown[] = []) => tmdbMock.mockImplementation(async (path: string) => ({ results: path === 'discover/movie' ? movies : shows }));

  it('returns the month soonest first, skipping released and poster-less titles, and says where to continue', async () => {
    respond(
      [release(1, '2026-12-20', 50), release(2, '2026-12-01', 10), release(3, '2026-11-01', 99), { ...release(4, '2026-12-05', 80), poster_path: null }],
      [{ id: 7, name: 'S7', poster_path: '/s.jpg', first_air_date: '2026-12-01', popularity: 30 }],
    );
    const r = await fetchComingSoonPage(1, undefined, TODAY);
    expect(r.items.map((i) => [i.id, i.media_type])).toEqual([[7, 'tv'], [2, 'movie'], [1, 'movie']]);   // same day: the more popular first
    expect(r.nextPage).toBe(2);
    const [, params] = tmdbMock.mock.calls[0];
    expect(params).toMatchObject({ 'primary_release_date.gte': '2026-11-25', 'primary_release_date.lte': '2026-12-24' });
  });

  it('skips a quiet month instead of returning an empty page', async () => {
    tmdbMock.mockImplementation(async (path: string, params: Record<string, string>) =>
      ({ results: path === 'discover/movie' && params['primary_release_date.gte'] === comingSoonWindow(3, TODAY).from ? [release(5, '2027-02-10', 5)] : [] }));
    const r = await fetchComingSoonPage(2, undefined, TODAY);
    expect(r.items.map((i) => i.id)).toEqual([5]);
    expect(r.nextPage).toBe(4);                                                         // continues after the month it found
  });

  it('ends at the last window', async () => {
    respond([release(6, '2027-12-20', 5)]);
    expect((await fetchComingSoonPage(COMING_SOON_PAGES, undefined, TODAY)).nextPage).toBeNull();
    respond([]);
    expect(await fetchComingSoonPage(COMING_SOON_PAGES, undefined, TODAY)).toEqual({ items: [], nextPage: null });
  });
});
