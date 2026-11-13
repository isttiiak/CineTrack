import { describe, expect, it } from 'vitest';
import { migratedStates, normalizeState } from './schema';

const raw = (platform: unknown, extra: Record<string, unknown> = {}) => ({
  entries: [{ id: 'a', title: 'Heat', year: '1995', type: 'Film', section: 'General' }],
  meta: { a: { id: 'a', status: 'watched', watchPlatform: platform, ...extra } },
  sectionOrder: ['General'],
  lastModified: '2026-01-01T00:00:00.000Z',
});

describe('platform migration (Torrent / FTB → Other)', () => {
  it('converts the old names and flags the state so it gets written back', () => {
    for (const old of ['Torrent', 'FTB', 'torrent', ' ftb ']) {
      const s = normalizeState(raw(old))!;
      expect(s.meta.a.watchPlatform, old).toBe('Other');
      expect(migratedStates.has(s), old).toBe(true);
    }
  });

  it('keeps everything else on the entry', () => {
    const s = normalizeState(raw('Torrent', { personalRating: 8, notes: 'great', watchedOn: '2026-02-03' }))!;
    expect(s.meta.a).toMatchObject({ status: 'watched', personalRating: 8, notes: 'great', watchedOn: '2026-02-03', watchPlatform: 'Other' });
  });

  it('leaves current platforms alone and does not flag them', () => {
    const s = normalizeState(raw('Netflix'))!;
    expect(s.meta.a.watchPlatform).toBe('Netflix');
    expect(migratedStates.has(s)).toBe(false);
  });

  it('still drops values that were never valid, without flagging a migration', () => {
    const s = normalizeState(raw('SomeSite'))!;
    expect(s.meta.a.watchPlatform).toBeUndefined();
    expect(migratedStates.has(s)).toBe(false);
  });

  it('is idempotent: a converted state normalizes to the same thing', () => {
    const once = normalizeState(raw('Torrent'))!;
    const twice = normalizeState(JSON.parse(JSON.stringify(once)))!;
    expect(twice).toEqual(once);
    expect(migratedStates.has(twice)).toBe(false);
  });
});
