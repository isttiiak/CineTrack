import type { MovieEntry, WatchMeta, WatchlistState, WatchStatus } from '../types';
import { imdbIdOf } from './duplicates';
import { parseMins, ratingSourceOf } from './utils';

/**
 * Export formats.
 *
 * JSON backup (version 2): readable *and* lossless.
 *   - `titles`: one self-contained record per title (details + your watch data joined, readable
 *     field names, external ids and links), for people, scripts and other apps.
 *   - `data`: the exact app state, used when restoring so nothing is lost.
 *   Older version 1 files (only `data`) still import.
 *
 * CSV: a spreadsheet of the same records (Excel/Numbers/Google Sheets), and Letterboxd's import
 * format (films only — Letterboxd doesn't track series): watched films with ratings and dates,
 * or the watchlist.
 */

export const EXPORT_VERSION = 2;

export interface ExportedTitle {
  title: string;
  year: number | null;
  type: 'movie' | 'series';
  status: 'plan_to_watch' | 'watching' | 'watched';
  myRating: number | null;          // 1–10
  watchedOn: string | null;         // YYYY-MM-DD
  progress: { season: number; episode: number } | null;
  platform: string | null;
  watchLink: string | null;         // private link you saved
  notes: string | null;
  section: string;
  genres: string[];
  countries: string[];
  runtime: string | null;           // as shown in the app, e.g. "2h 28m" or "45 min/ep · 24 eps"
  runtimeMinutes: number | null;    // total minutes when known
  publicRating: { value: number; source: 'IMDb' | 'TMDB' } | null;
  ids: { tmdb: number | null; imdb: string | null };
  links: { tmdb: string | null; imdb: string | null };
  poster: string | null;
}

const STATUS_OUT: Record<WatchStatus, ExportedTitle['status']> = { plan: 'plan_to_watch', watching: 'watching', watched: 'watched' };
const split = (s: string, sep: RegExp) => s.split(sep).map((x) => x.trim()).filter(Boolean);

export function toExportedTitle(e: MovieEntry, m: WatchMeta | undefined): ExportedTitle {
  const meta = m ?? { id: e.id, status: 'plan' as WatchStatus };
  const year = parseInt(e.year, 10);
  const rating = parseFloat(e.imdbRating);
  const imdb = imdbIdOf(e.imdbUrl);
  const tmdbKind = e.type === 'Series' ? 'tv' : 'movie';
  const mins = parseMins(meta.duration);
  return {
    title: e.title,
    year: Number.isFinite(year) ? year : null,
    type: e.type === 'Series' ? 'series' : 'movie',
    status: STATUS_OUT[meta.status],
    myRating: meta.personalRating ?? null,
    watchedOn: meta.watchedOn || null,
    progress: meta.progressSeason != null && meta.progressEpisode != null ? { season: meta.progressSeason, episode: meta.progressEpisode } : null,
    platform: meta.watchPlatform || null,
    watchLink: meta.watchLink || null,
    notes: meta.notes || null,
    section: e.section,
    genres: split(e.genre, /,/),
    countries: split(e.country, /[/,]/),
    runtime: meta.duration || null,
    runtimeMinutes: mins ? mins : null,
    publicRating: Number.isFinite(rating) && rating > 0 ? { value: rating, source: ratingSourceOf(e) === 'tmdb' ? 'TMDB' : 'IMDb' } : null,
    ids: { tmdb: e.tmdbId ?? null, imdb },
    links: {
      tmdb: e.tmdbId ? `https://www.themoviedb.org/${tmdbKind}/${e.tmdbId}` : null,
      imdb: imdb ? `https://www.imdb.com/title/${imdb}/` : null,
    },
    poster: e.posterUrl ?? null,
  };
}

export function buildJsonExport(state: WatchlistState, opts: { now?: Date; source?: string } = {}) {
  const titles = state.entries.map((e) => toExportedTitle(e, state.meta[e.id]));
  const count = (s: ExportedTitle['status']) => titles.filter((t) => t.status === s).length;
  return {
    app: 'cinetrack',
    version: EXPORT_VERSION,
    exportedAt: (opts.now ?? new Date()).toISOString(),
    ...(opts.source ? { source: opts.source } : {}),
    summary: {
      titles: titles.length,
      movies: titles.filter((t) => t.type === 'movie').length,
      series: titles.filter((t) => t.type === 'series').length,
      planToWatch: count('plan_to_watch'),
      watching: count('watching'),
      watched: count('watched'),
      rated: titles.filter((t) => t.myRating != null).length,
    },
    titles,
    data: state,
  };
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/** RFC 4180 cell: quoted when it contains a comma, quote or newline. Leading =,+,-,@ are
 *  prefixed with an apostrophe so spreadsheets don't run them as formulas (CSV injection). */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csv = (header: string[], rows: unknown[][]) =>
  [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const SPREADSHEET_HEADER = [
  'Title', 'Year', 'Type', 'Status', 'My Rating', 'Watched On', 'Progress', 'Platform', 'Section',
  'Genres', 'Country', 'Runtime', 'Runtime (min)', 'Public Rating', 'Rating Source', 'IMDb ID', 'TMDB ID',
  'IMDb URL', 'TMDB URL', 'Notes', 'Watch Link',
];

/** Every title with your data, for Excel / Numbers / Google Sheets (UTF-8 with BOM for Excel). */
export function buildSpreadsheetCsv(state: WatchlistState): string {
  const rows = state.entries.map((e) => {
    const t = toExportedTitle(e, state.meta[e.id]);
    return [
      t.title, t.year, t.type === 'series' ? 'Series' : 'Movie',
      { plan_to_watch: 'Plan to Watch', watching: 'Watching', watched: 'Watched' }[t.status],
      t.myRating, t.watchedOn, t.progress ? `S${t.progress.season}E${t.progress.episode}` : '', t.platform,
      t.section, t.genres.join(', '), t.countries.join(', '), t.runtime, t.runtimeMinutes,
      t.publicRating?.value, t.publicRating?.source, t.ids.imdb, t.ids.tmdb, t.links.imdb, t.links.tmdb,
      t.notes, t.watchLink,
    ];
  });
  return '\uFEFF' + csv(SPREADSHEET_HEADER, rows);
}

/**
 * Letterboxd's import format (letterboxd.com/import): films only.
 * `watched` = films you've watched (rating, watch date, notes as the review);
 * `watchlist` = films you plan to watch (import it on Letterboxd's watchlist page).
 */
export function buildLetterboxdCsv(state: WatchlistState, which: 'watched' | 'watchlist'): { csv: string; count: number } {
  const films = state.entries.filter((e) => e.type === 'Film').map((e) => ({ e, m: state.meta[e.id] }));
  const pick = films.filter(({ m }) => (which === 'watched' ? m?.status === 'watched' : (m?.status ?? 'plan') !== 'watched'));
  const header = which === 'watched'
    ? ['Title', 'Year', 'imdbID', 'tmdbID', 'Rating10', 'WatchedDate', 'Review']
    : ['Title', 'Year', 'imdbID', 'tmdbID'];
  const rows = pick.map(({ e, m }) => {
    const base = [e.title, e.year.slice(0, 4), imdbIdOf(e.imdbUrl) ?? '', e.tmdbId ?? ''];
    return which === 'watched'
      ? [...base, m?.personalRating != null ? Math.round(m.personalRating) : '', m?.watchedOn ?? '', m?.notes ?? '']
      : base;
  });
  return { csv: csv(header, rows), count: rows.length };
}

// ── Importing a version 2 file that only has `titles` (hand-made or from another tool) ──

const STATUS_IN: Record<string, WatchStatus> = { plan_to_watch: 'plan', plan: 'plan', watching: 'watching', watched: 'watched' };

/** `titles` records → app state (used when a file has `titles` but no `data`). */
export function stateFromTitles(titles: unknown[]): WatchlistState {
  const entries: MovieEntry[] = [];
  const meta: Record<string, WatchMeta> = {};
  titles.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const t = raw as Partial<ExportedTitle> & Record<string, unknown>;
    if (typeof t.title !== 'string' || !t.title.trim()) return;
    const id = `import_${i}_${Math.random().toString(36).slice(2, 8)}`;
    const imdb = t.ids?.imdb ?? null;
    entries.push({
      id, title: t.title, year: t.year != null ? String(t.year) : '',
      type: t.type === 'series' ? 'Series' : 'Film',
      section: typeof t.section === 'string' && t.section ? t.section : (t.type === 'series' ? 'TV Series' : 'General'),
      country: Array.isArray(t.countries) ? t.countries.join(', ') : '',
      genre: Array.isArray(t.genres) ? t.genres.join(', ') : '',
      imdbRating: t.publicRating?.value != null ? String(t.publicRating.value) : '',
      ratingSource: t.publicRating?.source === 'TMDB' ? 'tmdb' : 'imdb',
      imdbUrl: imdb ? `https://www.imdb.com/title/${imdb}/` : '',
      ...(t.ids?.tmdb ? { tmdbId: t.ids.tmdb } : {}),
      ...(t.poster ? { posterUrl: t.poster } : {}),
      isCustom: true,
    });
    meta[id] = {
      id,
      status: STATUS_IN[String(t.status)] ?? 'plan',
      ...(t.myRating != null ? { personalRating: t.myRating } : {}),
      ...(t.watchedOn ? { watchedOn: t.watchedOn } : {}),
      ...(t.platform ? { watchPlatform: t.platform as WatchMeta['watchPlatform'] } : {}),
      ...(t.watchLink ? { watchLink: t.watchLink } : {}),
      ...(t.notes ? { notes: t.notes } : {}),
      ...(t.runtime ? { duration: t.runtime } : {}),
      ...(t.progress ? { progressSeason: t.progress.season, progressEpisode: t.progress.episode } : {}),
    };
  });
  return { entries, meta, sectionOrder: [], lastModified: new Date(0).toISOString() };
}
