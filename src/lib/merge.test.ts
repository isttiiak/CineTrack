import { describe, expect, it } from 'vitest';
import type { MovieEntry, WatchMeta, WatchlistState } from '../types';
import { mergeWatchlist, sameContent } from './merge';

const entry = (id: string, extra: Partial<MovieEntry> = {}): MovieEntry => ({
  id, title: `Title ${id}`, section: 'General', type: 'Film', year: '2024', country: '', genre: '',
  imdbRating: '', imdbUrl: '', isCustom: true, ...extra,
});

function state(entries: MovieEntry[], meta: Record<string, Partial<WatchMeta>> = {}, lastModified = '2026-01-01T00:00:00.000Z'): WatchlistState {
  return {
    entries,
    meta: Object.fromEntries(entries.map((e) => [e.id, { id: e.id, status: 'plan', ...meta[e.id] } as WatchMeta])),
    sectionOrder: ['General'],
    lastModified,
  };
}

const base = state([entry('a'), entry('b')]);

describe('mergeWatchlist', () => {
  it('keeps edits both devices made to different entries', () => {
    const ours = state([entry('a'), entry('b')], { a: { status: 'watched' } });
    const theirs = state([entry('a'), entry('b')], { b: { status: 'watching' } });
    const merged = mergeWatchlist(base, ours, theirs);
    expect(merged.meta.a.status).toBe('watched');
    expect(merged.meta.b.status).toBe('watching');
  });

  it('keeps edits to different fields of the same entry', () => {
    const ours = state([entry('a', { posterUrl: 'https://image.tmdb.org/p.jpg' }), entry('b')]);
    const theirs = state([entry('a', { title: 'Renamed' }), entry('b')], { a: { notes: 'great' } });
    const merged = mergeWatchlist(base, ours, theirs);
    const a = merged.entries.find((e) => e.id === 'a')!;
    expect(a.title).toBe('Renamed');
    expect(a.posterUrl).toBe('https://image.tmdb.org/p.jpg');
    expect(merged.meta.a.notes).toBe('great');
  });

  it('lets ours win when both sides changed the same field', () => {
    const ours = state([entry('a'), entry('b')], { a: { personalRating: 9 } });
    const theirs = state([entry('a'), entry('b')], { a: { personalRating: 4 } });
    expect(mergeWatchlist(base, ours, theirs).meta.a.personalRating).toBe(9);
  });

  it('a background poster fetch does not undo another device\'s status change', () => {
    // The bug this replaces: a device that just opened fetched posters, saved the whole
    // document with a newer clock, and erased edits made elsewhere.
    const ours = state([entry('a', { posterUrl: 'https://image.tmdb.org/x.jpg' }), entry('b')]);
    const theirs = state([entry('a'), entry('b')], { a: { status: 'watched', watchedOn: '2026-01-02' } });
    const merged = mergeWatchlist(base, ours, theirs);
    expect(merged.meta.a).toMatchObject({ status: 'watched', watchedOn: '2026-01-02' });
  });

  it('keeps entries added on either side', () => {
    const ours = state([entry('a'), entry('b'), entry('c')]);
    const theirs = state([entry('a'), entry('b'), entry('d')]);
    expect(mergeWatchlist(base, ours, theirs).entries.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('applies deletes from either side, even over an edit', () => {
    const ours = state([entry('b')]);                                         // deleted a
    const theirs = state([entry('a'), entry('b', { title: 'Edited' })], { a: { status: 'watched' } });
    const merged = mergeWatchlist(base, ours, theirs);
    expect(merged.entries.map((e) => e.id)).toEqual(['b']);
    expect(merged.entries[0].title).toBe('Edited');
    expect(merged.meta.a).toBeUndefined();

    const merged2 = mergeWatchlist(base, theirs, ours);                      // symmetric
    expect(merged2.entries.map((e) => e.id)).toEqual(['b']);
  });

  it('removes a field this side cleared', () => {
    const b = state([entry('a')], { a: { notes: 'old' } });
    const ours = state([entry('a')]);                                          // cleared notes
    const theirs = state([entry('a')], { a: { notes: 'old', status: 'watching' } });
    const merged = mergeWatchlist(b, ours, theirs);
    expect(merged.meta.a.notes).toBeUndefined();
    expect(merged.meta.a.status).toBe('watching');
  });

  it('does not depend on device clocks', () => {
    // Our clock is far behind, yet our edit still survives and theirs is kept too.
    const ours = state([entry('a'), entry('b')], { a: { status: 'watched' } }, '2000-01-01T00:00:00.000Z');
    const theirs = state([entry('a'), entry('b')], { b: { status: 'watched' } }, '2030-01-01T00:00:00.000Z');
    const merged = mergeWatchlist(base, ours, theirs);
    expect([merged.meta.a.status, merged.meta.b.status]).toEqual(['watched', 'watched']);
  });

  it('takes the other side\'s section order unless ours changed it', () => {
    const ours = { ...state([entry('a')]), sectionOrder: ['General'] };
    const theirs = { ...state([entry('a')]), sectionOrder: ['Racing', 'General'] };
    expect(mergeWatchlist({ ...base, sectionOrder: ['General'] }, ours, theirs).sectionOrder).toEqual(['Racing', 'General']);
    expect(mergeWatchlist({ ...base, sectionOrder: ['Racing', 'General'] }, ours, theirs).sectionOrder).toEqual(['General']);
  });

  it('with no base, unions both sides and prefers ours on conflicts', () => {
    const ours = state([entry('a', { title: 'Mine' })]);
    const theirs = state([entry('a', { title: 'Theirs' }), entry('z')]);
    const merged = mergeWatchlist(null, ours, theirs);
    expect(merged.entries.map((e) => [e.id, e.title])).toEqual([['a', 'Mine'], ['z', 'Title z']]);
  });
});

describe('sameContent', () => {
  it('ignores key order and lastModified', () => {
    const a = state([entry('a')], {}, '2020-01-01T00:00:00.000Z');
    const b: WatchlistState = {
      ...a,
      lastModified: '2030-01-01T00:00:00.000Z',
      meta: { a: { status: 'plan', id: 'a' } },
      entries: [Object.fromEntries(Object.entries(a.entries[0]).reverse()) as unknown as MovieEntry],
    };
    expect(sameContent(a, b)).toBe(true);
    expect(sameContent(a, { ...a, meta: { a: { id: 'a', status: 'watched' } } })).toBe(false);
  });
});
