import { beforeEach, describe, expect, it, vi } from 'vitest';

const tmdbMock = vi.hoisted(() => vi.fn());
vi.mock('./tmdb', () => ({ tmdb: tmdbMock }));

import { MAX_SEARCH_PAGES, searchDiscover, searchDiscoverMore } from './discoverSearch';

const title = (id: number, t: string, extra: Record<string, unknown> = {}) => ({ id, title: t, media_type: 'movie', popularity: 10, vote_count: 100, release_date: '2010-01-01', ...extra });

describe('search paging', () => {
  beforeEach(() => tmdbMock.mockReset());

  it('page 1 says whether more pages exist; page 2 asks TMDB for page 2 with the same filters', async () => {
    tmdbMock.mockImplementation(async (path: string) => (path === 'search/multi' ? { results: [title(1, 'Dune'), title(2, 'Dune Drifter')], total_pages: 4 } : { results: [] }));
    const first = await searchDiscover('dune', undefined);
    expect(first.hasMore).toBe(true);

    tmdbMock.mockReset();
    tmdbMock.mockResolvedValue({ results: [title(3, 'Dune: Part Two'), { id: 9, name: 'Some Person', media_type: 'person', popularity: 50 }], total_pages: 4 });
    const more = await searchDiscoverMore('dune', 2);
    const [path, params] = tmdbMock.mock.calls[0];
    expect(path).toBe('search/multi');
    expect(params).toMatchObject({ query: 'dune', page: '2' });
    expect(more.items.map((i) => i.id)).toEqual([3]);                                // people are not part of later pages
    expect(more.hasMore).toBe(true);
  });

  it('keeps the type filter on later pages', async () => {
    tmdbMock.mockResolvedValue({ results: [title(3, 'Dune')], total_pages: 3 });
    await searchDiscoverMore('dune is:film year:2021', 2);
    expect(tmdbMock.mock.calls[0][0]).toBe('search/movie');
    expect(tmdbMock.mock.calls[0][1]).toMatchObject({ query: 'dune', year: '2021', page: '2' });
  });

  it('stops at the last page TMDB reports and at the search page cap', async () => {
    tmdbMock.mockResolvedValue({ results: [title(3, 'Dune')], total_pages: 2 });
    expect((await searchDiscoverMore('dune', 2)).hasMore).toBe(false);
    tmdbMock.mockResolvedValue({ results: [title(3, 'Dune')], total_pages: 80 });
    expect((await searchDiscoverMore('dune', MAX_SEARCH_PAGES)).hasMore).toBe(false);
    expect((await searchDiscoverMore('dune', MAX_SEARCH_PAGES - 1)).hasMore).toBe(true);
  });

  it('nothing to search for means nothing to page', async () => {
    expect(await searchDiscoverMore('   ', 2)).toEqual({ items: [], hasMore: false });
    expect(tmdbMock).not.toHaveBeenCalled();
  });
});
