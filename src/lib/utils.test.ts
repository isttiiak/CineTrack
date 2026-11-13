import { describe, expect, it } from 'vitest';
import { localDateKey, parseMins, ratingSourceOf } from './utils';
import { safeUrl } from './schema';

describe('parseMins', () => {
  it('parses film runtimes', () => {
    expect(parseMins('2h 28m')).toBe(148);
    expect(parseMins('2h')).toBe(120);
    expect(parseMins('95m')).toBe(95);
    expect(parseMins('95 min')).toBe(95);
  });

  it('totals a series from per-episode length and episode count', () => {
    expect(parseMins('45 min/ep · 24 eps')).toBe(45 * 24);
    expect(parseMins('30 min/ep · 1 ep')).toBe(30);
  });

  it('reports an unknown total for per-episode lengths without a count', () => {
    expect(parseMins('45 min/ep')).toBeNull();
  });

  it('treats empty or unparseable labels as zero', () => {
    expect(parseMins(undefined)).toBe(0);
    expect(parseMins('')).toBe(0);
    expect(parseMins('long')).toBe(0);
  });
});

describe('localDateKey', () => {
  it('uses the local calendar date', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('ratingSourceOf', () => {
  it('uses the stored source, else infers TMDB for Discover-added entries', () => {
    expect(ratingSourceOf({ ratingSource: 'imdb', tmdbId: 1 })).toBe('imdb');
    expect(ratingSourceOf({ tmdbId: 1 })).toBe('tmdb');
    expect(ratingSourceOf({})).toBe('imdb');
    expect(ratingSourceOf({ tmdbId: 1, isCustom: false })).toBe('imdb');   // starter titles had IMDb scores
  });
});

describe('safeUrl', () => {
  it('allows only http(s)', () => {
    expect(safeUrl('https://www.imdb.com/title/tt1/')).toBe('https://www.imdb.com/title/tt1/');
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,<script>')).toBe('');
    expect(safeUrl(' JaVaScRiPt:alert(1)')).toBe('');
  });
});
