import { describe, expect, it } from 'vitest';
import type { MovieEntry, WatchMeta, WatchlistState } from '../types';
import { computeStats, fmtDuration } from './stats';

const e = (id: string, extra: Partial<MovieEntry> = {}): MovieEntry => ({
  id, title: `T${id}`, section: 'General', type: 'Film', year: '2020', country: 'USA', genre: 'Drama',
  imdbRating: '7.0', imdbUrl: '', isCustom: true, ...extra,
});
function state(rows: [MovieEntry, Partial<WatchMeta>][]): WatchlistState {
  return {
    entries: rows.map(([x]) => x),
    meta: Object.fromEntries(rows.map(([x, m]) => [x.id, { id: x.id, status: 'plan', ...m } as WatchMeta])),
    sectionOrder: ['General', 'TV Series'], lastModified: '',
  };
}
const NOW = new Date(2026, 10, 13);   // Fri 13 Nov 2026

const S = state([
  [e('a', { genre: 'Drama, Crime', year: '1999', imdbRating: '8.0' }), { status: 'watched', watchedOn: '2026-11-12', duration: '2h', personalRating: 9 }],
  [e('b', { type: 'Series', section: 'TV Series', genre: 'Drama', country: 'South Korea' }), { status: 'watched', watchedOn: '2026-11-03', duration: '50 min/ep · 10 eps', personalRating: 9 }],
  [e('c', { genre: 'Comedy', imdbRating: '8.0' }), { status: 'watched', watchedOn: '2026-10-30', duration: '1h 30m', personalRating: 6 }],
  [e('d', { year: '2011' }), { status: 'watched', watchedOn: '2025-03-01', duration: '2h' }],
  [e('e'), { status: 'watched' }],
  [e('f'), { status: 'plan', duration: '2h' }],
  [e('g', { type: 'Series', section: 'TV Series' }), { status: 'watching' }],
]);

describe('computeStats', () => {
  it('counts the library and time watched', () => {
    const s = computeStats(S, 'all', NOW);
    expect(s.byStatus).toEqual({ plan: 1, watching: 1, watched: 5 });
    expect(s.watchedInPeriod).toBe(5);
    expect(s.watchedUndated).toBe(1);
    expect(s.minutesWatched).toBe(120 + 500 + 90 + 120);
    expect(s.seriesMinutes).toBe(500);
    expect(s.backlogCount).toBe(2);
    expect(s.backlogMinutes).toBe(120);
  });

  it('filters activity by year', () => {
    const y = computeStats(S, '2025', NOW);
    expect(y.watchedInPeriod).toBe(1);
    expect(y.months.find((m) => m.key === '2025-03')?.value).toBe(1);
    expect(computeStats(S, 'all', NOW).years).toEqual(['2026', '2025']);
  });

  it('builds the last 12 months and the peak', () => {
    const s = computeStats(S, 'all', NOW);
    expect(s.months).toHaveLength(12);
    expect(s.months[11]).toMatchObject({ key: '2026-11', value: 2 });
    expect(s.peakMonth?.key).toBe('2026-11');
  });

  it('measures weekly streaks', () => {
    const s = computeStats(S, 'all', NOW);
    // Weeks of 9 Nov, 2 Nov and 26 Oct all have a watch → 3-week streak.
    expect(s.streakWeeks).toBe(3);
    expect(s.longestStreakWeeks).toBe(3);
  });

  it('compares your ratings with IMDb and finds favourite genres', () => {
    const s = computeStats(S, 'all', NOW);
    expect(s.avgRating).toBe(8);
    expect(s.ratingHistogram.find((b) => b.key === '9')?.value).toBe(2);
    expect(s.vsImdb).toBe(0.3);    // (9-8 + 9-7 + 6-8) / 3
    expect(s.lovedMore[0].entry.id).toBe('b');
    expect(s.lovedLess[0].entry.id).toBe('c');
    expect(s.genres[0]).toMatchObject({ label: 'Drama', value: 4 });
    expect(s.favouriteGenre).toBe('Drama');
  });

  it('groups decades, countries and section completion', () => {
    const s = computeStats(S, 'all', NOW);
    expect(s.decades.map((d) => d.key)).toEqual(['1990s', '2010s', '2020s']);
    expect(s.countries[0]).toMatchObject({ label: 'USA' });
    expect(s.sections.find((x) => x.key === 'TV Series')).toMatchObject({ done: 1, total: 2, value: 50 });
  });

  it('writes insights', () => {
    const s = computeStats(S, 'all', NOW);
    expect(s.insights.some((t) => t.includes('Drama'))).toBe(true);
    expect(s.insights.some((t) => t.includes('3-week'))).toBe(true);
  });
});

describe('fmtDuration', () => {
  it('formats minutes', () => {
    expect(fmtDuration(0)).toBe('0h');
    expect(fmtDuration(95)).toBe('1h 35m');
    expect(fmtDuration(60 * 100)).toBe('100h');
  });
});
