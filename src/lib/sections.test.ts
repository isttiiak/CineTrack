import { describe, expect, it } from 'vitest';
import { isMarvelTitle, suggestedSection } from './sections';

const co = (...names: string[]) => ({ production_companies: names.map((name, id) => ({ id, name })) });

describe('Marvel detection', () => {
  it('recognises Marvel production companies', () => {
    for (const n of ['Marvel Studios', 'Marvel Entertainment', 'Marvel Animation', 'Marvel Television']) {
      expect(isMarvelTitle(co('Columbia Pictures', n)), n).toBe(true);
    }
  });
  it('does not match lookalikes or other companies', () => {
    expect(isMarvelTitle(co('Marvelous Productions'))).toBe(false);
    expect(isMarvelTitle(co('Warner Bros.', 'Legendary'))).toBe(false);
    expect(isMarvelTitle(co())).toBe(false);
    expect(isMarvelTitle({})).toBe(false);
    expect(isMarvelTitle(undefined)).toBe(false);
  });
  it('suggests the Marvel section only for Marvel titles', () => {
    expect(suggestedSection(co('Marvel Studios'))).toBe('Marvel');
    expect(suggestedSection(co('A24'))).toBeNull();
  });
});
