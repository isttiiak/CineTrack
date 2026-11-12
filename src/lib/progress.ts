import type { EpisodeRef, SeasonInfo } from './titleData';

export interface EpisodePos { season: number; episode: number }

const cmp = (a: EpisodePos, b: EpisodePos) => a.season - b.season || a.episode - b.episode;

/** The episode after `cur` (or S1E1 when nothing has been watched yet). Null at the very end. */
export function nextEpisode(seasons: SeasonInfo[], cur?: EpisodePos | null): EpisodePos | null {
  if (seasons.length === 0) return null;
  if (!cur) return { season: seasons[0].season_number, episode: 1 };
  const idx = seasons.findIndex((s) => s.season_number === cur.season);
  const season = seasons[idx];
  if (season && cur.episode < season.episode_count) return { season: cur.season, episode: cur.episode + 1 };
  const next = seasons[idx + 1];
  return next ? { season: next.season_number, episode: 1 } : null;
}

/** The episode before `cur`; null when `cur` is the first episode (i.e. go back to "not started"). */
export function prevEpisode(seasons: SeasonInfo[], cur: EpisodePos): EpisodePos | null {
  if (cur.episode > 1) return { season: cur.season, episode: cur.episode - 1 };
  const idx = seasons.findIndex((s) => s.season_number === cur.season);
  const prev = seasons[idx - 1];
  return prev ? { season: prev.season_number, episode: prev.episode_count } : null;
}

/** True when `cur` has reached the latest episode that has aired. */
export function isCaughtUp(cur: EpisodePos | null | undefined, lastAired: EpisodeRef | null | undefined): boolean {
  if (!cur || !lastAired) return false;
  return cmp(cur, { season: lastAired.season_number, episode: lastAired.episode_number }) >= 0;
}

/** Aired episodes still to watch after `cur`. */
export function episodesLeft(seasons: SeasonInfo[], cur: EpisodePos | null | undefined, lastAired: EpisodeRef | null | undefined): number {
  if (!lastAired) return 0;
  const end = { season: lastAired.season_number, episode: lastAired.episode_number };
  let left = 0;
  for (const s of seasons) {
    for (let e = 1; e <= s.episode_count; e++) {
      const pos = { season: s.season_number, episode: e };
      if (cmp(pos, end) > 0) return left;
      if (!cur || cmp(pos, cur) > 0) left++;
    }
  }
  return left;
}

const ENDED = /^(ended|canceled|cancelled)$/i;

/**
 * Status after logging progress: finishing the last episode of a show that has ended marks it
 * watched; any progress on a planned show makes it "watching". Otherwise the status is unchanged.
 */
export function statusAfterProgress(
  current: 'plan' | 'watching' | 'watched',
  cur: EpisodePos | null,
  lastAired: EpisodeRef | null | undefined,
  showStatus: string | undefined,
): 'plan' | 'watching' | 'watched' {
  if (!cur) return current === 'watched' ? 'watching' : current;
  if (isCaughtUp(cur, lastAired) && showStatus && ENDED.test(showStatus)) return 'watched';
  if (current === 'plan') return 'watching';
  if (current === 'watched' && !isCaughtUp(cur, lastAired)) return 'watching';
  return current;
}
