import { describe, expect, it } from 'vitest';
import type { MovieEntry, WatchlistState } from '../types';
import { buildJsonExport, buildLetterboxdCsv, buildSpreadsheetCsv, csvCell, stateFromTitles, EXPORT_VERSION } from './exporters';
import { candidatesFrom, parseCsv } from './csvImport';
import { normalizeState } from './schema';

const entry = (id: string, extra: Partial<MovieEntry> = {}): MovieEntry => ({
  id, title: 'Inception', section: 'General', type: 'Film', year: '2010', country: 'USA/UK',
  genre: 'Action, Sci-Fi', imdbRating: '8.8', ratingSource: 'imdb', imdbUrl: 'https://www.imdb.com/title/tt1375666/',
  tmdbId: 27205, posterUrl: 'https://image.tmdb.org/t/p/w185/x.jpg', isCustom: true, ...extra,
});

const state: WatchlistState = {
  entries: [
    entry('a'),
    entry('b', { title: 'Shōgun, "Part 1"', type: 'Series', section: 'TV Series', year: '2024', imdbRating: '8.6', ratingSource: 'tmdb', imdbUrl: '', tmdbId: 126308 }),
    entry('c', { title: 'Past Lives', year: '2023', imdbUrl: '', tmdbId: 666277, imdbRating: '' }),
  ],
  meta: {
    a: { id: 'a', status: 'watched', personalRating: 9, watchedOn: '2024-01-28', notes: 'Line one\nline, two', watchPlatform: 'Netflix', duration: '2h 28m' },
    b: { id: 'b', status: 'watching', progressSeason: 1, progressEpisode: 4, duration: '57 min/ep · 10 eps' },
    c: { id: 'c', status: 'plan' },
  },
  sectionOrder: ['General', 'TV Series'],
  lastModified: '2026-11-13T00:00:00.000Z',
};

describe('JSON backup (version 2)', () => {
  const out = buildJsonExport(state, { now: new Date('2026-11-13T10:00:00Z'), source: 'https://example.app' });

  it('has a summary and readable, self-contained titles', () => {
    expect(out).toMatchObject({ app: 'cinetrack', version: EXPORT_VERSION, exportedAt: '2026-11-13T10:00:00.000Z', source: 'https://example.app' });
    expect(out.summary).toEqual({ titles: 3, movies: 2, series: 1, planToWatch: 1, watching: 1, watched: 1, rated: 1 });
    expect(out.titles[0]).toEqual({
      title: 'Inception', year: 2010, type: 'movie', status: 'watched', myRating: 9, watchedOn: '2024-01-28',
      progress: null, platform: 'Netflix', watchLink: null, notes: 'Line one\nline, two', section: 'General',
      genres: ['Action', 'Sci-Fi'], countries: ['USA', 'UK'], runtime: '2h 28m', runtimeMinutes: 148,
      publicRating: { value: 8.8, source: 'IMDb' }, ids: { tmdb: 27205, imdb: 'tt1375666' },
      links: { tmdb: 'https://www.themoviedb.org/movie/27205', imdb: 'https://www.imdb.com/title/tt1375666/' },
      poster: 'https://image.tmdb.org/t/p/w185/x.jpg',
    });
    expect(out.titles[1]).toMatchObject({ type: 'series', status: 'watching', progress: { season: 1, episode: 4 }, publicRating: { source: 'TMDB' }, runtimeMinutes: 570 });
  });

  it('round-trips losslessly through `data`', () => {
    const restored = normalizeState(JSON.parse(JSON.stringify(out)).data);
    expect(restored).toEqual(state);
  });

  it('can be rebuilt from `titles` alone', () => {
    const rebuilt = normalizeState(stateFromTitles(JSON.parse(JSON.stringify(out.titles))))!;
    expect(rebuilt.entries.map((e) => [e.title, e.type, e.tmdbId, e.ratingSource])).toEqual([
      ['Inception', 'Film', 27205, 'imdb'], ['Shōgun, "Part 1"', 'Series', 126308, 'tmdb'], ['Past Lives', 'Film', 666277, 'imdb'],
    ]);
    const m = rebuilt.meta[rebuilt.entries[0].id];
    expect(m).toMatchObject({ status: 'watched', personalRating: 9, watchedOn: '2024-01-28', watchPlatform: 'Netflix', notes: 'Line one\nline, two' });
    expect(rebuilt.meta[rebuilt.entries[1].id]).toMatchObject({ status: 'watching', progressSeason: 1, progressEpisode: 4 });
  });
});

describe('CSV', () => {
  it('escapes quotes, commas and newlines, and defuses formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(null)).toBe('');
  });

  it('spreadsheet export parses back with every field, and re-imports as CineTrack data', () => {
    const text = buildSpreadsheetCsv(state);
    expect(text.startsWith('﻿')).toBe(true);
    const rows = parseCsv(text);
    expect(rows[0].slice(0, 6)).toEqual(['Title', 'Year', 'Type', 'Status', 'My Rating', 'Watched On']);
    expect(rows[1].slice(0, 7)).toEqual(['Inception', '2010', 'Movie', 'Watched', '9', '2024-01-28', '']);
    expect(rows[2][0]).toBe('Shōgun, "Part 1"');
    expect(rows[2][6]).toBe('S1E4');

    const { kind, candidates } = candidatesFrom(rows, 'cinetrack.csv');
    expect(kind).toBe('cinetrack');
    expect(candidates.map((c) => [c.title, c.status, c.rating, c.watchedOn, c.tmdbRef?.id, c.imdbId])).toEqual([
      ['Inception', 'watched', 9, '2024-01-28', 27205, 'tt1375666'],
      ['Shōgun, "Part 1"', 'watching', undefined, undefined, 126308, undefined],
      ['Past Lives', 'plan', undefined, undefined, 666277, undefined],
    ]);
  });

  it('Letterboxd export is films only, in their import format', () => {
    const watched = buildLetterboxdCsv(state, 'watched');
    expect(watched.count).toBe(1);
    expect(parseCsv(watched.csv)).toEqual([
      ['Title', 'Year', 'imdbID', 'tmdbID', 'Rating10', 'WatchedDate', 'Review'],
      ['Inception', '2010', 'tt1375666', '27205', '9', '2024-01-28', 'Line one\nline, two'],
    ]);
    const list = buildLetterboxdCsv(state, 'watchlist');
    expect(parseCsv(list.csv)).toEqual([['Title', 'Year', 'imdbID', 'tmdbID'], ['Past Lives', '2023', '', '666277']]);
  });
});
