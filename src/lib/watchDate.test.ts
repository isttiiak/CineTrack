import { describe, expect, it } from 'vitest';
import {
  buildWatchDate, clampToPast, formatWatchDate, isValidWatchDate, parseWatchDate, precisionOf,
  todayWatchDate, yesterdayWatchDate,
} from './watchDate';
import { normalizeState } from './schema';
import { computeStats } from './stats';
import { buildLetterboxdCsv } from './exporters';
import { candidatesFrom, parseCsv } from './csvImport';
import type { MovieEntry, WatchMeta, WatchlistState } from '../types';

describe('parse / build', () => {
  it('accepts year, month and day precision, and rejects impossible dates', () => {
    expect(parseWatchDate('2019')).toEqual({ year: 2019 });
    expect(parseWatchDate('2024-03')).toEqual({ year: 2024, month: 3 });
    expect(parseWatchDate('2024-03-14')).toEqual({ year: 2024, month: 3, day: 14 });
    for (const bad of ['', '24', '2024-13', '2024-00', '2024-02-30', '2023-02-29', '1700', '2024-3', '2024/03/14', 'tomorrow', null, 2024]) {
      expect(isValidWatchDate(bad), String(bad)).toBe(false);
    }
    expect(isValidWatchDate('2024-02-29')).toBe(true);   // leap year
  });

  it('builds the stored string; a day needs a month, a month needs a year', () => {
    expect(buildWatchDate({ year: 2024 })).toBe('2024');
    expect(buildWatchDate({ year: 2024, month: 3 })).toBe('2024-03');
    expect(buildWatchDate({ year: 2024, month: 3, day: 5 })).toBe('2024-03-05');
    expect(buildWatchDate({ year: 2024, day: 5 })).toBe('2024');
    expect(buildWatchDate({ month: 3, day: 5 })).toBeUndefined();
    expect(buildWatchDate({ year: 2023, month: 2, day: 30 })).toBeUndefined();
  });

  it('reports precision and formats for display', () => {
    expect(precisionOf('2019')).toBe('year');
    expect(precisionOf('2024-03')).toBe('month');
    expect(precisionOf('2024-03-14')).toBe('day');
    expect(precisionOf(undefined)).toBeNull();
    expect(formatWatchDate('2019', 'en-US')).toBe('2019');
    expect(formatWatchDate('2024-03', 'en-US')).toBe('Mar 2024');
    expect(formatWatchDate('2024-03-14', 'en-US')).toBe('Mar 14, 2024');
    expect(formatWatchDate('nonsense')).toBe('');
  });
});

describe('never in the future', () => {
  const now = new Date(2026, 10, 13);   // 13 Nov 2026
  it('clamps to today at the same precision', () => {
    expect(clampToPast('2027', now)).toBe('2026');
    expect(clampToPast('2027-05-01', now)).toBe('2026-11-13');
    expect(clampToPast('2026-12', now)).toBe('2026-11');
    expect(clampToPast('2026-11-20', now)).toBe('2026-11-13');
    expect(clampToPast('2026-11-12', now)).toBe('2026-11-12');
    expect(clampToPast('2019-07', now)).toBe('2019-07');
  });

  it('today and yesterday', () => {
    expect(todayWatchDate(now)).toBe('2026-11-13');
    expect(yesterdayWatchDate(now)).toBe('2026-11-12');
    expect(yesterdayWatchDate(new Date(2026, 2, 1))).toBe('2026-02-28');
  });
});

const entry = (id: string): MovieEntry => ({ id, title: `T${id}`, section: 'General', type: 'Film', year: '2020', country: 'USA', genre: 'Drama', imdbRating: '7', imdbUrl: '', isCustom: true });
const state = (dates: Record<string, string | undefined>): WatchlistState => {
  const ids = Object.keys(dates);
  return {
    entries: ids.map(entry),
    meta: Object.fromEntries(ids.map((id) => [id, { id, status: 'watched', watchedOn: dates[id], duration: '2h' } as WatchMeta])),
    sectionOrder: ['General'], lastModified: '',
  };
};

describe('stored data', () => {
  it('normalizeState keeps valid partial dates and drops invalid ones', () => {
    const s = normalizeState({
      entries: ['a', 'b', 'c', 'd'].map(entry),
      meta: { a: { watchedOn: '2019' }, b: { watchedOn: '2024-03' }, c: { watchedOn: '2024-02-30' }, d: { watchedOn: '2026-11-13' } },
      sectionOrder: [], lastModified: '',
    })!;
    expect([s.meta.a.watchedOn, s.meta.b.watchedOn, s.meta.c.watchedOn, s.meta.d.watchedOn]).toEqual(['2019', '2024-03', undefined, '2026-11-13']);
  });
});

describe('analytics with partial dates', () => {
  const NOW = new Date(2026, 10, 13);
  const s = computeStats(state({ a: '2026-11-12', b: '2026-11', c: '2019', d: undefined }), 'all', NOW);

  it('counts them in totals and years, but only dated-by-day titles in heatmap and streaks', () => {
    expect(s.watchedInPeriod).toBe(4);
    expect(s.years).toEqual(['2026', '2019']);
    expect(s.heatmap.filter((c) => c.count > 0)).toEqual([{ date: '2026-11-12', count: 1 }]);
    expect(s.streakWeeks).toBe(1);
    expect(s.last30).toBe(1);
  });

  it('uses month-precision dates in the monthly bars, and year-only ones in the year view', () => {
    expect(s.months.find((m) => m.key === '2026-11')?.value).toBe(2);       // day + month dated
    expect(computeStats(state({ c: '2019', e: '2019-05' }), '2019', NOW).watchedInPeriod).toBe(2);
    expect(computeStats(state({ c: '2019', e: '2019-05' }), '2019', NOW).months.find((m) => m.key === '2019-05')?.value).toBe(1);
  });

  it('reports how many have a partial date, and how many none', () => {
    expect(s.watchedPartial).toBe(2);
    expect(s.watchedUndated).toBe(1);
  });
});

describe('export and import', () => {
  it('Letterboxd diary only gets full dates (it needs a day)', () => {
    const { csv } = buildLetterboxdCsv(state({ a: '2026-11-12', b: '2026-11', c: '2019' }), 'watched');
    const rows = parseCsv(csv);
    expect(rows.slice(1).map((r) => r[5])).toEqual(['2026-11-12', '', '']);
  });

  it('spreadsheet import keeps a year or month as written', () => {
    const rows = parseCsv('Title,Status,My Rating,TMDB ID,Watched On\nA,Watched,8,1,2019\nB,Watched,,2,2024-03\nC,Watched,,3,2024-03-14\n');
    const { candidates } = candidatesFrom(rows, 'cinetrack.csv');
    expect(candidates.map((c) => c.watchedOn)).toEqual(['2019', '2024-03', '2024-03-14']);
  });
});
