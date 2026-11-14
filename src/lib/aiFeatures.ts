import type { PasteItem, TasteStats, TonightCandidate } from '../../api/_aiTasks';
import type { WatchlistState } from '../types';
import type { ImportCandidate } from './csvImport';
import type { Stats } from './stats';
import { parseMins } from './utils';
import { isValidWatchDate } from './watchDate';

/** Minutes for one sitting: a film's length, or one episode's. 0 when unknown. */
export function typicalMinutes(duration?: string): number {
  const perEp = duration?.match(/(\d+)\s*min\s*\/\s*ep\b/i);
  if (perEp) return parseInt(perEp[1], 10);
  return parseMins(duration) ?? 0;
}

const MAX_TONIGHT = 60;

/**
 * What "Tonight" may choose from: titles still to watch or in progress. Only title, year, genres,
 * length, type and public rating leave the device: never notes, dates, links or the user's ratings.
 * `entryIds[i]` maps a candidate's `i` back to the entry. Over 60 titles, the best rated go first.
 */
export function buildTonight(state: WatchlistState): { candidates: TonightCandidate[]; entryIds: string[] } {
  const open = state.entries
    .filter((e) => (state.meta[e.id]?.status ?? 'plan') !== 'watched')
    .sort((a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0))
    .slice(0, MAX_TONIGHT);
  const entryIds: string[] = [];
  const candidates = open.map((e, i) => {
    entryIds.push(e.id);
    const rating = parseFloat(e.imdbRating);
    return {
      i, t: e.title, y: e.year, g: e.genre.split(',').map((g) => g.trim()).filter(Boolean).slice(0, 3).join(', '),
      m: typicalMinutes(state.meta[e.id]?.duration), k: e.type === 'Series' ? 'series' as const : 'film' as const,
      r: Number.isFinite(rating) ? rating : null,
    };
  });
  return { candidates, entryIds };
}

/** Needs a few watched titles to say anything true. Titles sent: only those the user rated 9 or 10. */
export function buildTasteStats(stats: Stats, state: WatchlistState): TasteStats | null {
  if (stats.byStatus.watched < 3) return null;
  const loved = state.entries
    .map((e) => ({ title: e.title, rating: state.meta[e.id]?.personalRating ?? 0 }))
    .filter((x) => x.rating >= 9)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 6)
    .map((x) => x.title);
  return {
    total: stats.total, watched: stats.byStatus.watched, films: stats.films, series: stats.series,
    avgRating: stats.avgRating ?? undefined, vsCrowd: stats.vsImdb ?? undefined, favouriteGenre: stats.favouriteGenre ?? undefined,
    genres: stats.genres.slice(0, 6).map((g) => ({ n: g.label, c: g.value, ...(g.avgRating !== null ? { avg: g.avgRating } : {}) })),
    decades: stats.decades.slice(0, 4).map((d) => ({ n: d.label, c: d.value })),
    countries: stats.countries.slice(0, 4).map((c) => ({ n: c.label, c: c.value })),
    loved,
  };
}

/** What the AI read from pasted text → candidates for the same match-and-review step as any import. */
export function candidatesFromPaste(items: PasteItem[]): ImportCandidate[] {
  return items.map((it) => ({
    key: `ai:${it.title.toLowerCase()}|${it.year}`,
    title: it.title,
    year: it.year,
    type: it.type === 'series' ? 'Series' as const : it.type === 'film' ? 'Film' as const : undefined,
    status: it.status,
    rating: it.rating,
    // A date only means something for a watched title, and must be a real one.
    watchedOn: it.status === 'watched' && it.watchedOn && isValidWatchDate(it.watchedOn) ? it.watchedOn : undefined,
    source: 'text' as const,
  }));
}
