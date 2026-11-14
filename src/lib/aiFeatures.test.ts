import { describe, expect, it } from 'vitest';
import type { MovieEntry, WatchMeta, WatchlistState } from '../types';
import { buildTasteStats, buildTonight, candidatesFromPaste, typicalMinutes } from './aiFeatures';
import { computeStats } from './stats';

const entry = (id: string, over: Partial<MovieEntry> = {}): MovieEntry =>
  ({ id, title: `Title ${id}`, year: '2020', type: 'Film', section: 'General', country: 'USA', genre: 'Comedy, Drama, Romance, Crime', imdbRating: '7.0', imdbUrl: '', isCustom: true, ...over });
const state = (entries: MovieEntry[], meta: Record<string, Partial<WatchMeta>> = {}): WatchlistState => ({
  entries, meta: Object.fromEntries(entries.map((e) => [e.id, { id: e.id, status: 'plan', ...meta[e.id] }])), sectionOrder: ['General'], lastModified: '2026-01-01T00:00:00Z',
});

describe('typicalMinutes', () => {
  it('reads one sitting: a film\'s length or one episode\'s', () => {
    expect(typicalMinutes('2h 6m')).toBe(126);
    expect(typicalMinutes('95m')).toBe(95);
    expect(typicalMinutes('57 min/ep · 24 eps')).toBe(57);
    expect(typicalMinutes(undefined)).toBe(0);
    expect(typicalMinutes('')).toBe(0);
  });
});

describe('buildTonight', () => {
  it('offers titles still to watch or in progress, never watched ones', () => {
    const s = state([entry('a'), entry('b'), entry('c')], { b: { status: 'watched' }, c: { status: 'watching' } });
    const { candidates, entryIds } = buildTonight(s);
    expect(candidates.map((c) => c.t).sort()).toEqual(['Title a', 'Title c']);
    expect(entryIds.sort()).toEqual(['a', 'c']);
  });
  it('sends only title, year, genres, length, type and public rating, and maps ids back', () => {
    const s = state([entry('a', { type: 'Series', imdbRating: '8.4' })], { a: { notes: 'secret note', watchLink: 'https://x.example', personalRating: 3, duration: '50 min/ep · 10 eps' } });
    const { candidates, entryIds } = buildTonight(s);
    expect(candidates).toEqual([{ i: 0, t: 'Title a', y: '2020', g: 'Comedy, Drama, Romance', m: 50, k: 'series', r: 8.4 }]);   // 3 genres at most
    expect(JSON.stringify(candidates)).not.toMatch(/secret|x\.example/);
    expect(entryIds[candidates[0].i]).toBe('a');
  });
  it('caps the list at 60 and keeps the best rated', () => {
    const many = Array.from({ length: 80 }, (_, k) => entry(String(k), { imdbRating: String(1 + (k % 9)) }));
    const { candidates } = buildTonight(state(many));
    expect(candidates).toHaveLength(60);
    expect(Math.min(...candidates.map((c) => c.r ?? 0))).toBeGreaterThanOrEqual(2);
    expect(candidates.map((c) => c.i)).toEqual(Array.from({ length: 60 }, (_, k) => k));
  });
  it('handles an empty list', () => {
    expect(buildTonight(state([])).candidates).toEqual([]);
  });
});

describe('buildTasteStats', () => {
  const watched = (n: number) => {
    const es = Array.from({ length: n }, (_, k) => entry(`w${k}`, { genre: k % 2 ? 'Drama' : 'Comedy', year: k % 2 ? '1995' : '2015', country: 'South Korea' }));
    return state(es, Object.fromEntries(es.map((e, k) => [e.id, { status: 'watched' as const, personalRating: 6 + (k % 5), watchedOn: '2026-05-01' }])));
  };
  it('says nothing about a list with fewer than 3 watched titles', () => {
    const s = watched(2);
    expect(buildTasteStats(computeStats(s), s)).toBeNull();
  });
  it('summarises counts and shares only the titles rated 9 or 10', () => {
    const s = watched(8);
    const t = buildTasteStats(computeStats(s), s)!;
    expect(t).toMatchObject({ total: 8, watched: 8, films: 8, series: 0 });
    expect(t.genres.map((g) => g.n).sort()).toEqual(['Comedy', 'Drama']);
    expect(t.countries[0]).toMatchObject({ n: 'South Korea', c: 8 });
    expect(t.loved.every((title) => title.startsWith('Title w'))).toBe(true);
    expect(t.loved.length).toBeLessThanOrEqual(6);
    const ratings = new Map(s.entries.map((e) => [e.title, s.meta[e.id].personalRating!]));
    expect(t.loved.every((title) => ratings.get(title)! >= 9)).toBe(true);
  });
});

describe('candidatesFromPaste', () => {
  it('keeps status, rating and a valid date for watched titles', () => {
    const c = candidatesFromPaste([
      { title: 'Dune', year: '2021', type: 'film', status: 'watched', rating: 9, watchedOn: '2026-10' },
      { title: 'Severance', year: '', type: 'series', status: 'plan', watchedOn: '2026-10-01' },
      { title: 'Alien', year: '1979', status: 'watched', watchedOn: '2026-13-45' },
    ]);
    expect(c[0]).toMatchObject({ title: 'Dune', year: '2021', type: 'Film', status: 'watched', rating: 9, watchedOn: '2026-10', source: 'text', key: 'ai:dune|2021' });
    expect(c[1]).toMatchObject({ type: 'Series', status: 'plan', watchedOn: undefined });      // a date means nothing for a planned title
    expect(c[2].watchedOn).toBeUndefined();                                                      // not a real date
    expect(c[2].type).toBeUndefined();
  });
});
