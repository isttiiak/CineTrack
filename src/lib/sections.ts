import type { TitleDetails } from './titleData';

export const MARVEL_SECTION = 'Marvel';

/**
 * Marvel titles (MCU films and series, Marvel Animation, and the older Marvel Entertainment
 * productions) by TMDB's production companies: "Marvel Studios", "Marvel Entertainment",
 * "Marvel Animation", "Marvel Television" … One franchise, hundreds of titles, hence its own section.
 */
export function isMarvelTitle(details: Pick<TitleDetails, 'production_companies'> | undefined): boolean {
  return !!details?.production_companies?.some((c) => /^marvel\b/i.test(c.name));
}

/** A better default section than "General" / "TV Series" for a title about to be added, or null. */
export function suggestedSection(details: Pick<TitleDetails, 'production_companies'> | undefined): string | null {
  return isMarvelTitle(details) ? MARVEL_SECTION : null;
}
