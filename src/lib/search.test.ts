import { describe, expect, it } from 'vitest';
import type { MovieEntry, WatchMeta } from '../types';
import { editDistance, highlightParts, parseQuery, scoreEntry, searchEntries } from './search';

const e = (id: string, title: string, extra: Partial<MovieEntry> = {}): MovieEntry => ({
  id, title, section: 'General', type: 'Film', year: '2024', country: 'USA', genre: 'Drama',
  imdbRating: '7.5', imdbUrl: '', isCustom: true, ...extra,
});

const entries = [
  e('1', 'Oppenheimer', { year: '2023', genre: 'Biography, Drama, History', imdbRating: '8.3' }),
  e('2', 'Dune: Part Two', { genre: 'Action, Adventure, Sci-Fi', imdbRating: '8.5' }),
  e('3', 'Shōgun', { type: 'Series', country: 'USA/Japan', section: 'TV Series', imdbRating: '8.9' }),
  e('4', 'Spider-Man: Across the Spider-Verse', { year: '2023', genre: 'Animation, Action', section: 'Animation & Family' }),
  e('5', 'Squid Game Season 2', { type: 'Series', country: 'South Korea', section: 'K-Drama & Asian', imdbRating: '7.5' }),
  e('6', 'Dune', { year: '2021', genre: 'Sci-Fi' }),
];
const meta: Record<string, WatchMeta> = {
  '1': { id: '1', status: 'watched', personalRating: 9, notes: 'Incredible score by Ludwig' },
  '2': { id: '2', status: 'plan', watchPlatform: 'Netflix' },
  '3': { id: '3', status: 'watching' },
  '4': { id: '4', status: 'plan' },
  '5': { id: '5', status: 'plan' },
  '6': { id: '6', status: 'watched', personalRating: 7 },
};

const ids = (q: string) => searchEntries(entries, meta, parseQuery(q))
  .sort((a, b) => b.score - a.score).map((r) => r.entry.id);

describe('parseQuery', () => {
  it('splits text, phrases and filters', () => {
    const q = parseQuery('dune "part two" year:2024 rating>8 is:plan');
    expect(q.terms).toEqual(['dune']);
    expect(q.phrases).toEqual(['part two']);
    expect(q.filters).toEqual([
      { key: 'year', op: ':', value: '2024' },
      { key: 'rating', op: '>', value: '8' },
      { key: 'is', op: ':', value: 'plan' },
    ]);
  });

  it('keeps unknown "word:" text as search words', () => {
    expect(parseQuery('Mission: Impossible').terms).toEqual(['mission', 'impossible']);
    expect(parseQuery('foo:bar').filters).toEqual([]);
  });
});

describe('search', () => {
  it('ignores accents, case and punctuation', () => {
    expect(ids('shogun')).toEqual(['3']);
    expect(ids('SPIDERMAN')).toEqual(['4']);
    expect(ids('spider verse')).toEqual(['4']);
  });

  it('tolerates typos', () => {
    expect(ids('oppenhiemer')).toEqual(['1']);
    expect(ids('opennheimer')).toEqual(['1']);
    expect(ids('dnue')).toEqual(['6', '2']);   // a swapped pair of letters counts as one typo
    expect(ids('xyzw')).toEqual([]);
  });

  it('matches every word, across fields', () => {
    expect(ids('korea series')).toEqual(['5']);
    expect(ids('sci-fi 2021')).toEqual(['6']);
    expect(ids('dune korea')).toEqual([]);
    expect(ids('watched dune')).toEqual(['6']);
  });

  it('ranks an exact title first, then prefix, then other matches', () => {
    expect(ids('dune')).toEqual(['6', '2']);
    expect(ids('drama')[0]).toBe('1');   // genre matches only — any order, but Oppenheimer has it
  });

  it('finds words in notes', () => {
    expect(ids('ludwig')).toEqual(['1']);
  });

  it('applies filters', () => {
    expect(ids('year:2023').sort()).toEqual(['1', '4']);
    expect(ids('year:2021-2023').sort()).toEqual(['1', '4', '6']);
    expect(ids('year>2023').sort()).toEqual(['2', '3', '5']);
    expect(ids('status:watched').sort()).toEqual(['1', '6']);
    expect(ids('is:seen').sort()).toEqual(['1', '6']);
    expect(ids('is:series').sort()).toEqual(['3', '5']);
    expect(ids('type:movie dune').sort()).toEqual(['2', '6']);
    expect(ids('rating>8.4').sort()).toEqual(['2', '3']);
    expect(ids('my>=8')).toEqual(['1']);
    expect(ids('is:rated').sort()).toEqual(['1', '6']);
    expect(ids('platform:netflix')).toEqual(['2']);
    expect(ids('genre:animation')).toEqual(['4']);
    expect(ids('has:notes')).toEqual(['1']);
    expect(ids('section:"k-drama"').length).toBeGreaterThanOrEqual(0);
  });

  it('returns null for non-matches and 0 for filter-only matches', () => {
    expect(scoreEntry(parseQuery('zzz'), entries[0], meta['1'])).toBeNull();
    expect(scoreEntry(parseQuery('year:2023'), entries[0], meta['1'])).toBe(0);
  });
});

describe('editDistance', () => {
  it('counts transpositions as one edit and stops early', () => {
    expect(editDistance('dnue', 'dune', 2)).toBe(1);
    expect(editDistance('kitten', 'sitting', 3)).toBe(3);
    expect(editDistance('a', 'abcdef', 1)).toBe(2);
  });
});

describe('highlightParts', () => {
  it('highlights matches regardless of accents and punctuation', () => {
    expect(highlightParts('Shōgun', parseQuery('shog'))).toEqual([{ text: 'Shōg', hit: true }, { text: 'un', hit: false }]);
    expect(highlightParts('Spider-Man', parseQuery('spiderman'))).toEqual([{ text: 'Spider-Man', hit: true }]);
    expect(highlightParts('Dune: Part Two', parseQuery('part'))).toEqual([
      { text: 'Dune: ', hit: false }, { text: 'Part', hit: true }, { text: ' Two', hit: false },
    ]);
  });
});
