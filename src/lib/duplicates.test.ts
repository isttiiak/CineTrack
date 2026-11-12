import { describe, expect, it } from 'vitest';
import type { MovieEntry } from '../types';
import { findDuplicate, findSimilar, normalizeTitle } from './duplicates';

const e = (id: string, title: string, extra: Partial<MovieEntry> = {}): MovieEntry => ({
  id, title, section: 'General', type: 'Film', year: '2024', country: '', genre: '',
  imdbRating: '', imdbUrl: '', isCustom: true, ...extra,
});
const list = [
  e('dune2', 'Dune: Part Two'),
  e('dune84', 'Dune', { year: '1984' }),
  e('shogun', 'Shōgun', { type: 'Series' }),
  e('spider', 'Spider-Man: No Way Home', { year: '2021' }),
  e('opp', 'Oppenheimer', { year: '2023', imdbUrl: 'https://www.imdb.com/title/tt15398776/' }),
  e('rocky2', 'Rocky II', { year: '1979' }),
];
const c = (title: string, extra: Partial<MovieEntry> = {}) => ({ title, year: '', type: 'Film' as const, imdbUrl: '', ...extra });

describe('normalizeTitle', () => {
  it('treats number words and roman numerals as digits', () => {
    expect(normalizeTitle('Dune: Part Two')).toBe('dune part 2');
    expect(normalizeTitle('Dune Part 2')).toBe('dune part 2');
    expect(normalizeTitle('Rocky II')).toBe('rocky 2');
    expect(normalizeTitle('V for Vendetta')).toBe('v for vendetta');
  });
});

describe('findDuplicate (strict)', () => {
  it('matches spelling variants of the same title and type', () => {
    expect(findDuplicate(list, c('dune part 2', { year: '2024' }))?.id).toBe('dune2');
    expect(findDuplicate(list, c('Rocky 2'))?.id).toBe('rocky2');
    expect(findDuplicate(list, c('SHOGUN', { type: 'Series' }))?.id).toBe('shogun');
  });

  it('matches by IMDb id regardless of title', () => {
    expect(findDuplicate(list, c('Oppenheimer (IMAX)', { imdbUrl: 'https://imdb.com/title/tt15398776' }))?.id).toBe('opp');
  });

  it('does not flag remakes from another year', () => {
    expect(findDuplicate(list, c('Dune', { year: '2021' }))).toBeNull();
  });
});

describe('findSimilar (Add form warning)', () => {
  it('flags the same title filed under the other type', () => {
    // The Add form defaults to Film; Shōgun is listed as a Series.
    expect(findSimilar(list, c('Shogun'))).toMatchObject({ kind: 'similar', entry: { id: 'shogun' } });
  });

  it('flags spacing differences and typos', () => {
    expect(findSimilar(list, c('Spiderman No Way Home'))).toMatchObject({ kind: 'similar', entry: { id: 'spider' } });
    expect(findSimilar(list, c('Oppenhiemer'))).toMatchObject({ kind: 'similar', entry: { id: 'opp' } });
  });

  it('reports definite duplicates as "same"', () => {
    expect(findSimilar(list, c('Dune: Part Two', { year: '2024' }))?.kind).toBe('same');
  });

  it('leaves different titles and remakes alone', () => {
    expect(findSimilar(list, c('Dune', { year: '2021' }))).toBeNull();
    expect(findSimilar(list, c('Rocky III'))).toBeNull();   // numbers must match exactly
    expect(findSimilar(list, c('Dunkirk'))).toBeNull();
  });

  it('ignores the entry being edited', () => {
    expect(findSimilar(list, c('Oppenheimer', { year: '2023' }), 'opp')).toBeNull();
  });
});
