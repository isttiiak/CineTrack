import { describe, expect, it } from 'vitest';
import type { MovieEntry, WatchMeta } from '../types';
import type { TMDBItem } from '../hooks/useTMDBDiscover';
import { genreTokens, pickSeeds, quality, rankRecommendations, seedWeight, tasteProfile } from './recommend';

const e = (id: string, title: string, extra: Partial<MovieEntry> = {}): MovieEntry => ({
  id, title, section: 'General', type: 'Film', year: '2020', country: 'USA', genre: 'Drama', imdbRating: '', imdbUrl: '', isCustom: true, ...extra,
});
const m = (id: string, extra: Partial<WatchMeta> = {}): WatchMeta => ({ id, status: 'watched', ...extra });
const item = (id: number, title: string, extra: Partial<TMDBItem> = {}): TMDBItem => ({
  id, title, media_type: 'movie', poster_path: '/p.jpg', vote_average: 7.5, vote_count: 3000, popularity: 50,
  overview: '', genre_ids: [18], original_language: 'en', release_date: '2020-05-01', ...extra,
});

describe('seedWeight', () => {
  it('weights ratings, treats watched as mild interest, ignores planned, and flags dislikes', () => {
    expect(seedWeight(m('a', { personalRating: 10 }))).toBe(3);
    expect(seedWeight(m('a', { personalRating: 8 }))).toBe(2.2);
    expect(seedWeight(m('a', { personalRating: 7 }))).toBe(1.5);
    expect(seedWeight(m('a', { personalRating: 5 }))).toBe(0);
    expect(seedWeight(m('a', { personalRating: 3 }))).toBeLessThan(0);
    expect(seedWeight(m('a'))).toBe(1);
    expect(seedWeight(m('a', { status: 'watching' }))).toBe(0.8);
    expect(seedWeight(m('a', { status: 'plan' }))).toBeNull();
  });
});

describe('pickSeeds', () => {
  it('takes the strongest signals, never disliked or planned titles, even without a TMDB id', () => {
    const entries = [e('1', 'Loved'), e('2', 'Hated'), e('3', 'Planned'), e('4', 'Seen'), e('5', 'Liked')];
    const meta = {
      '1': m('1', { personalRating: 10 }), '2': m('2', { personalRating: 2 }), '3': m('3', { status: 'plan' }),
      '4': m('4'), '5': m('5', { personalRating: 7 }),
    };
    expect(pickSeeds(entries, meta, 8).map((s) => s.entry.title)).toEqual(['Loved', 'Liked', 'Seen']);
    expect(pickSeeds(entries, meta, 2)).toHaveLength(2);
  });

  it('breaks ties by most recently watched', () => {
    const entries = [e('1', 'Old'), e('2', 'New')];
    const meta = { '1': m('1', { watchedOn: '2019-01-01' }), '2': m('2', { watchedOn: '2026-01-01' }) };
    expect(pickSeeds(entries, meta).map((s) => s.entry.title)).toEqual(['New', 'Old']);
  });
});

describe('taste profile', () => {
  it('learns liked and disliked genres, folding names together', () => {
    expect(genreTokens('Action & Adventure, Science Fiction')).toEqual(['action', 'adventure', 'sci-fi']);
    const entries = [e('1', 'A', { genre: 'Sci-Fi, Drama' }), e('2', 'B', { genre: 'Horror' })];
    const p = tasteProfile(entries, { '1': m('1', { personalRating: 9 }), '2': m('2', { personalRating: 2 }) });
    expect(p.get('sci-fi')).toBe(1);
    expect(p.get('horror')).toBe(-0.5);
  });
});

describe('quality', () => {
  it('damps scores that have few votes', () => {
    expect(quality({ vote_average: 9.5, vote_count: 8 })).toBeLessThan(quality({ vote_average: 8, vote_count: 20000 }));
    expect(quality({ vote_average: 4, vote_count: 5000 })).toBe(0);
  });
});

describe('rankRecommendations', () => {
  const seedA = { entry: e('1', 'Dune'), weight: 3 };
  const seedB = { entry: e('2', 'Arrival'), weight: 2.2 };
  const base = { entries: [e('1', 'Dune'), e('2', 'Arrival')], profile: new Map<string, number>(), today: '2026-11-13' };

  it('prefers a title several of your favourites agree on, and says why', () => {
    const r = rankRecommendations({
      ...base,
      lists: [
        { seed: seedA, results: [item(10, 'Solo pick'), item(11, 'Both like')] },
        { seed: seedB, results: [item(11, 'Both like')] },
      ],
    });
    expect(r.map((x) => x.item.id)).toEqual([11, 10]);
    expect(r[0].because).toBe('Because you liked Dune and Arrival');
  });

  it('drops titles already in the list (by id+type, or by title and year), posterless and obscure ones', () => {
    const r = rankRecommendations({
      ...base,
      entries: [...base.entries, e('3', 'Heat', { year: '1995' }), e('4', 'Tv Thing', { type: 'Series', tmdbId: 5 })],
      lists: [{ seed: seedA, results: [
        item(20, 'Heat', { release_date: '1995-12-15' }),                 // same title + year as an entry
        item(5, 'Same id, other type', { media_type: 'movie' }),          // ids overlap across movie/tv: kept
        item(5, 'Tv Thing', { media_type: 'tv', name: 'Tv Thing', title: undefined }),   // the listed series: dropped
        item(21, 'No poster', { poster_path: null }),
        item(22, 'Obscure', { vote_count: 3 }),
        item(23, 'Poorly reviewed', { vote_average: 4.1, vote_count: 900 }),
        item(24, 'Good pick'),
      ] }],
    });
    expect(r.map((x) => x.item.id).sort()).toEqual([24, 5].sort());
  });

  it('uses genre taste and review quality to order picks from the same seed', () => {
    const profile = new Map([['sci-fi', 1], ['romance', -1]]);
    const r = rankRecommendations({
      ...base, profile,
      lists: [{ seed: seedA, results: [
        item(30, 'Romance', { genre_ids: [10749] }),
        item(31, 'Sci-fi', { genre_ids: [878] }),
      ] }],
    });
    expect(r[0].item.id).toBe(31);
  });

  it('keeps unreleased titles (labelled by the card) and limits how much one seed can fill', () => {
    const many = Array.from({ length: 12 }, (_, i) => item(100 + i, `Dune-like ${i}`));
    const r = rankRecommendations({
      ...base, maxPerSeed: 3, limit: 6,
      lists: [
        { seed: seedA, results: [...many, item(200, 'Dune: Part Three', { release_date: '2026-12-18', vote_count: 0, vote_average: 0 })] },
        { seed: seedB, results: [item(300, 'Arrival-like')] },
      ],
    });
    expect(r.filter((x) => x.because.includes('Dune') && !x.because.includes('Arrival')).length).toBeGreaterThan(0);
    expect(r.slice(0, 4).some((x) => x.item.id === 300)).toBe(true);   // the other seed is represented near the top
  });
});
