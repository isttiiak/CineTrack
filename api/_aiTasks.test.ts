import { describe, expect, it } from 'vitest';
import { TASKS, sanitizeFilterQuery } from './_aiTasks';

const NOW = new Date('2026-11-15T12:00:00Z');

describe('filter task', () => {
  it('keeps what the watchlist search understands and drops everything else', () => {
    expect(sanitizeFilterQuery('genre:comedy status:plan year:2010-2019 rating>8 my>=7 "the thing" nolan')).toBe('genre:comedy status:plan year:2010-2019 rating>8 my>=7 "the thing" nolan');
    // markup, URLs and unknown syntax never survive; plain words are just title-search words
    expect(sanitizeFilterQuery('genre:comedy; DROP TABLE x -- <script>alert(1)</script> http://evil.example')).toBe('DROP TABLE x');
    expect(sanitizeFilterQuery('runtime<90 genre:drama bogus:key')).toBe('genre:drama');
  });
  it('caps the number of tokens and strips control characters', () => {
    expect(sanitizeFilterQuery('a b c d e f g h i j k').split(' ')).toHaveLength(8);
    expect(sanitizeFilterQuery('genre:drama\nstatus:plan\u0000')).toBe('genre:drama status:plan');
  });
  it('turns a model answer into a query and a summary, or null', () => {
    const t = TASKS.filter;
    expect(t.parse({ query: 'genre:comedy status:plan', summary: 'Unwatched comedies' }, { query: 'x' }, NOW)).toEqual({ query: 'genre:comedy status:plan', summary: 'Unwatched comedies' });
    expect(t.parse({ query: '', summary: '' }, { query: 'x' }, NOW)).toBeNull();
    expect(t.parse({ query: '<script>' }, { query: 'x' }, NOW)).toBeNull();
    expect(t.parse('nope', { query: 'x' }, NOW)).toBeNull();
  });
  it('validates the request text', () => {
    expect(TASKS.filter.validate({ query: 'comedies i have not seen' })).toEqual({ query: 'comedies i have not seen' });
    for (const bad of [{ query: 'ab' }, { query: 'x'.repeat(201) }, {}, null, 'text']) expect(TASKS.filter.validate(bad)).toBeNull();
  });
});

describe('tonight task', () => {
  const cands = Array.from({ length: 70 }, (_, k) => ({ i: k, t: `Title ${k}`, y: '2020', g: 'Comedy', m: 95, k: 'film', r: 7.2 }));
  it('validates and clamps the list sent from the browser', () => {
    const input = TASKS.tonight.validate({ mood: '  light\nand funny ', candidates: [...cands, { i: 'bad', t: 'x' }, { i: 99, t: '' }, 'junk'] })!;
    expect(input.candidates).toHaveLength(60);
    expect(input.mood).toBe('light and funny');
    expect(TASKS.tonight.validate({ mood: 'x', candidates: [] })).toBeNull();
    expect(TASKS.tonight.validate({ mood: 'x' })).toBeNull();
    expect(TASKS.tonight.validate({ mood: 'x', candidates: [{ i: 1, t: 'A', m: 99999, k: 'weird', r: 50 }] })!.candidates[0]).toMatchObject({ m: 0, k: 'film', r: null });
  });
  it('keeps only picks that exist in the list, de-duplicated, at most three', () => {
    const input = TASKS.tonight.validate({ mood: '', candidates: cands })!;
    const out = TASKS.tonight.parse({ picks: [{ i: 5, why: 'Short and light' }, { i: 5, why: 'dup' }, { i: 999, why: 'invented' }, { i: 7, why: 'x'.repeat(500) }, { i: 8, why: '' }, { i: 9, why: 'fourth' }], note: 'ok' }, input, NOW)!;
    expect(out.picks.map((p) => p.i)).toEqual([5, 7, 8]);
    expect(out.picks[1].why).toHaveLength(140);
    expect(out.note).toBe('ok');
  });
});

describe('taste task', () => {
  const stats = { total: 40, watched: 25, films: 30, series: 10, avgRating: 7.4, vsCrowd: 0.3, favouriteGenre: 'Drama', genres: [{ n: 'Drama', c: 12, avg: 8 }], decades: [{ n: '2010s', c: 9 }], countries: [{ n: 'South Korea', c: 5 }], loved: ['Parasite'] };
  it('accepts clean statistics', () => {
    expect(TASKS.taste.validate({ stats })!.stats).toMatchObject({ watched: 25, genres: [{ n: 'Drama', c: 12, avg: 8 }], loved: ['Parasite'] });
  });
  it('refuses to describe someone who has barely watched anything, or send junk', () => {
    expect(TASKS.taste.validate({ stats: { ...stats, watched: 2 } })).toBeNull();
    for (const bad of [{}, { stats: 'x' }, { stats: { total: 'many', watched: 5 } }]) expect(TASKS.taste.validate(bad)).toBeNull();
  });
  it('clamps lists and values', () => {
    const v = TASKS.taste.validate({ stats: { ...stats, genres: Array.from({ length: 20 }, (_, k) => ({ n: `G${k}`, c: k })), vsCrowd: 99, loved: Array.from({ length: 20 }, (_, k) => `T${k}`) } })!;
    expect(v.stats.genres).toHaveLength(6);
    expect(v.stats.loved).toHaveLength(6);
    expect(v.stats.vsCrowd).toBeUndefined();
  });
  it('returns the summary text or null', () => {
    expect(TASKS.taste.parse({ summary: 'You like drama.' }, { stats } as never, NOW)).toEqual({ summary: 'You like drama.' });
    expect(TASKS.taste.parse({ summary: '' }, { stats } as never, NOW)).toBeNull();
  });
});

describe('paste task', () => {
  it('validates the pasted text', () => {
    expect(TASKS.paste.validate({ text: ' watched Dune last month, loved it ' })).toEqual({ text: 'watched Dune last month, loved it' });
    expect(TASKS.paste.validate({ text: 'x'.repeat(9000) })!.text).toHaveLength(4000);
    for (const bad of [{ text: 'ab' }, {}, null]) expect(TASKS.paste.validate(bad)).toBeNull();
  });
  it('normalises items: valid years, statuses, ratings and dates only', () => {
    const text = 'Dune (2021) was great, Severance halfway, saw Alien in 2019, Inception 2010';
    const out = TASKS.paste.parse({ items: [
      { title: 'Dune', year: '2021', type: 'film', status: 'watched', rating: 8.6, watchedOn: '2026-10' },
      { title: 'dune', year: 2021 },                                         // duplicate
      { title: 'Severance', status: 'watching', rating: 99, watchedOn: '2099-01-01', type: 'show' },
      { title: 'Alien', year: '2019', status: 'seen', watchedOn: 'last tuesday' },   // 2019 is when it was watched, not its release year
      { title: 'Inception', year: 2010 },
      { title: '', year: '2020' },
      'junk',
    ] }, { text }, NOW)!;
    expect(out.items).toEqual([
      { title: 'Dune', year: '2021', type: 'film', status: 'watched', rating: 9, watchedOn: '2026-10' },
      { title: 'Severance', year: '', type: undefined, status: 'watching', rating: undefined, watchedOn: undefined },
      { title: 'Alien', year: '', type: undefined, status: 'plan', rating: undefined, watchedOn: undefined },
      { title: 'Inception', year: '2010', type: undefined, status: 'plan', rating: undefined, watchedOn: undefined },
    ]);
  });
  it('returns null without an items array', () => {
    expect(TASKS.paste.parse({ nope: 1 }, { text: 'x' }, NOW)).toBeNull();
  });
});
