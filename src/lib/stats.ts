import type { MovieEntry, WatchMeta, WatchlistState } from '../types';
import { localDateKey, parseMins, ratingSourceOf } from './utils';

/**
 * Everything the Analytics page shows, computed from the list (pure, so it can be tested).
 *
 * `period` is 'all' or a year ("2025"): activity stats (watched, hours, months, streaks,
 * genres/decades of what you watched) use titles with a "watched on" date in that period.
 * Library stats (backlog, statuses, completion) always describe the whole list.
 */

export type Period = 'all' | string;

export interface Bar { key: string; label: string; value: number; extra?: string }

export interface Stats {
  total: number;
  films: number; series: number;
  byStatus: { plan: number; watching: number; watched: number };

  // Activity in the period
  watchedInPeriod: number;
  watchedUndated: number;                 // watched titles without a date (only counted in 'all')
  minutesWatched: number;
  minutesUnknown: number;                 // watched series whose length we can't total
  filmMinutes: number; seriesMinutes: number;
  months: Bar[];                          // 12 bars: last 12 months, or Jan–Dec of the year
  peakMonth: Bar | null;
  heatmap: { date: string; count: number }[];
  avgPerMonth: number;                    // over the months shown (last 12 for 'all')
  last30: number;
  streakWeeks: number;                    // current run of weeks with ≥1 watch (this or last week)
  longestStreakWeeks: number;
  years: string[];                        // years with dated watches, newest first (for the picker)

  // Backlog
  backlogCount: number;
  backlogMinutes: number;
  weeksToClear: number | null;            // at the pace of the last 90 days

  // Ratings
  ratedCount: number;
  avgRating: number | null;
  ratingHistogram: Bar[];                 // 1..10
  vsImdb: number | null;                  // your avg − public avg (IMDb, or TMDB where that's the only score)
  vsImdbCount: number;
  crowdSource: string;                    // "IMDb", "TMDB" or "IMDb/TMDB" — what the comparison used
  lovedMore: { entry: MovieEntry; mine: number; imdb: number; source: string }[];   // you rated higher
  lovedLess: { entry: MovieEntry; mine: number; imdb: number; source: string }[];

  // Taste (what you watched in the period; whole list when nothing is watched yet)
  genres: (Bar & { avgRating: number | null })[];
  favouriteGenre: string | null;          // highest average rating, ≥2 rated titles
  decades: Bar[];
  countries: Bar[];
  platforms: Bar[];
  sections: (Bar & { done: number; total: number })[];   // completion per section

  insights: string[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekStart(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));     // Monday
  return localDateKey(x);
}

function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return localDateKey(new Date(y, m - 1, d + n));
}

function countBars(map: Map<string, number>, limit: number, labels?: (k: string) => string): Bar[] {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
    .map(([key, value]) => ({ key, label: labels ? labels(key) : key, value }));
}

const inc = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeStats(state: WatchlistState, period: Period = 'all', now = new Date()): Stats {
  const entries = state.entries;
  const metaOf = (e: MovieEntry): WatchMeta => state.meta[e.id] ?? { id: e.id, status: 'plan' };
  const today = localDateKey(now);
  const inPeriod = (date?: string) => !!date && (period === 'all' || date.startsWith(period));

  const byStatus = { plan: 0, watching: 0, watched: 0 };
  for (const e of entries) byStatus[metaOf(e).status]++;

  const watchedAll = entries.filter((e) => metaOf(e).status === 'watched');
  const dated = watchedAll.filter((e) => metaOf(e).watchedOn);
  const watched = period === 'all' ? watchedAll : dated.filter((e) => inPeriod(metaOf(e).watchedOn));

  // Hours
  let minutesWatched = 0, minutesUnknown = 0, filmMinutes = 0, seriesMinutes = 0;
  for (const e of watched) {
    const m = parseMins(metaOf(e).duration);
    if (m === null) { minutesUnknown++; continue; }
    minutesWatched += m;
    if (e.type === 'Film') filmMinutes += m; else seriesMinutes += m;
  }

  // Months: last 12 (all-time) or Jan–Dec of the chosen year
  const monthCount = new Map<string, number>();
  const monthMins = new Map<string, number>();
  for (const e of dated) {
    const k = metaOf(e).watchedOn!.slice(0, 7);
    inc(monthCount, k);
    inc(monthMins, k, parseMins(metaOf(e).duration) ?? 0);
  }
  const monthKeys = period === 'all'
    ? Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })
    : Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`);
  const months: Bar[] = monthKeys.map((k) => {
    const mins = monthMins.get(k) ?? 0;
    return { key: k, label: MONTHS[+k.slice(5) - 1], value: monthCount.get(k) ?? 0, extra: mins ? `${Math.round(mins / 60)}h` : undefined };
  });
  const peak = months.reduce<Bar | null>((best, m) => (m.value > (best?.value ?? 0) ? m : best), null);

  // Heatmap: 53 weeks ending this week (all-time) or the chosen calendar year
  const dayCount = new Map<string, number>();
  for (const e of dated) inc(dayCount, metaOf(e).watchedOn!);
  const heatStart = period === 'all' ? addDays(weekStart(now), -52 * 7) : weekStart(new Date(+period, 0, 1));
  const heatEnd = period === 'all' ? today : `${period}-12-31`;
  const heatmap: { date: string; count: number }[] = [];
  for (let d = heatStart; d <= heatEnd && heatmap.length < 380; d = addDays(d, 1)) {
    heatmap.push({ date: d, count: d > today ? -1 : dayCount.get(d) ?? 0 });
  }

  // Pace & streaks (weeks with at least one dated watch)
  const weeks = new Set(dated.map((e) => { const [y, m, d] = metaOf(e).watchedOn!.split('-').map(Number); return weekStart(new Date(y, m - 1, d)); }));
  let streakWeeks = 0;
  let w = weekStart(now);
  if (!weeks.has(w)) w = addDays(w, -7);                 // a streak survives until this week is over
  while (weeks.has(w)) { streakWeeks++; w = addDays(w, -7); }
  let longestStreakWeeks = 0, run = 0, prev = '';
  for (const k of [...weeks].sort()) {
    run = prev && addDays(prev, 7) === k ? run + 1 : 1;
    longestStreakWeeks = Math.max(longestStreakWeeks, run);
    prev = k;
  }
  const since = (days: number) => dated.filter((e) => metaOf(e).watchedOn! > addDays(today, -days)).length;
  const last30 = since(30);
  const last90 = since(90);
  const monthsWithData = period === 'all' ? 12 : (period === String(now.getFullYear()) ? now.getMonth() + 1 : 12);
  const avgPerMonth = round1(months.reduce((s, m) => s + m.value, 0) / monthsWithData);

  // Backlog
  const backlog = entries.filter((e) => metaOf(e).status !== 'watched');
  const backlogMinutes = backlog.reduce((s, e) => s + (parseMins(metaOf(e).duration) ?? 0), 0);
  const weeklyPace = last90 / (90 / 7);
  const weeksToClear = weeklyPace > 0 ? Math.ceil(backlog.length / weeklyPace) : null;

  // Ratings (your ratings on titles in scope)
  const ratedScope = (period === 'all' ? entries : watched).filter((e) => metaOf(e).personalRating != null);
  const ratings = ratedScope.map((e) => metaOf(e).personalRating!);
  const avgRating = ratings.length ? round1(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;
  const ratingHistogram: Bar[] = Array.from({ length: 10 }, (_, i) => ({
    key: String(i + 1), label: String(i + 1), value: ratings.filter((r) => Math.round(r) === i + 1).length,
  }));
  const pairs = ratedScope
    .filter((e) => parseFloat(e.imdbRating) > 0)
    .map((e) => ({ entry: e, mine: metaOf(e).personalRating!, imdb: parseFloat(e.imdbRating), source: ratingSourceOf(e) === 'tmdb' ? 'TMDB' : 'IMDb' }));
  const sources = [...new Set(pairs.map((p) => p.source))].sort();
  const crowdSource = sources.join('/') || 'IMDb';
  const vsImdb = pairs.length ? round1(pairs.reduce((s, p) => s + (p.mine - p.imdb), 0) / pairs.length) : null;
  const byDiff = [...pairs].sort((a, b) => (b.mine - b.imdb) - (a.mine - a.imdb));
  const lovedMore = byDiff.filter((p) => p.mine - p.imdb >= 1).slice(0, 3);
  const lovedLess = byDiff.reverse().filter((p) => p.imdb - p.mine >= 1).slice(0, 3);

  // Taste
  const tasteScope = watched.length ? watched : entries;
  const genreCount = new Map<string, number>();
  const genreRatings = new Map<string, number[]>();
  const decadeCount = new Map<string, number>();
  const countryCount = new Map<string, number>();
  const platformCount = new Map<string, number>();
  for (const e of tasteScope) {
    const m = metaOf(e);
    for (const g of e.genre.split(',').map((x) => x.trim()).filter(Boolean)) {
      inc(genreCount, g);
      if (m.personalRating != null) genreRatings.set(g, [...(genreRatings.get(g) ?? []), m.personalRating]);
    }
    const y = parseInt(e.year, 10);
    if (Number.isFinite(y)) inc(decadeCount, `${Math.floor(y / 10) * 10}s`);
    for (const c of e.country.split(/[/,]/).map((x) => x.trim()).filter(Boolean)) inc(countryCount, c);
    if (m.watchPlatform) inc(platformCount, m.watchPlatform);
  }
  const genres = countBars(genreCount, 8).map((b) => {
    const r = genreRatings.get(b.key) ?? [];
    return { ...b, avgRating: r.length ? round1(r.reduce((a, c) => a + c, 0) / r.length) : null };
  });
  const favourite = [...genreRatings.entries()].filter(([, r]) => r.length >= 2)
    .map(([g, r]) => [g, r.reduce((a, c) => a + c, 0) / r.length] as const)
    .sort((a, b) => b[1] - a[1])[0];
  const decades = [...decadeCount.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => ({ key, label: key, value }));

  const sectionTotals = new Map<string, { done: number; total: number }>();
  for (const e of entries) {
    const s = sectionTotals.get(e.section) ?? { done: 0, total: 0 };
    s.total++; if (metaOf(e).status === 'watched') s.done++;
    sectionTotals.set(e.section, s);
  }
  const sections = state.sectionOrder.filter((s) => sectionTotals.has(s)).map((s) => {
    const t = sectionTotals.get(s)!;
    return { key: s, label: s, value: Math.round((t.done / t.total) * 100), done: t.done, total: t.total };
  });

  const years = [...new Set(dated.map((e) => metaOf(e).watchedOn!.slice(0, 4)))].sort().reverse();

  const stats: Stats = {
    total: entries.length,
    films: entries.filter((e) => e.type === 'Film').length,
    series: entries.filter((e) => e.type === 'Series').length,
    byStatus,
    watchedInPeriod: watched.length,
    watchedUndated: period === 'all' ? watchedAll.length - dated.length : 0,
    minutesWatched, minutesUnknown, filmMinutes, seriesMinutes,
    months, peakMonth: peak, heatmap, avgPerMonth, last30, streakWeeks, longestStreakWeeks, years,
    backlogCount: backlog.length, backlogMinutes, weeksToClear,
    ratedCount: ratings.length, avgRating, ratingHistogram, vsImdb, vsImdbCount: pairs.length, crowdSource, lovedMore, lovedLess,
    genres, favouriteGenre: favourite ? favourite[0] : null,
    decades,
    countries: countBars(countryCount, 6),
    platforms: countBars(platformCount, 6),
    sections,
    insights: [],
  };
  stats.insights = insightsFor(stats);
  return stats;
}

function insightsFor(s: Stats): string[] {
  const out: string[] = [];
  if (s.genres[0] && s.genres[0].value >= 2) out.push(`${s.genres[0].label} is your most-watched genre (${s.genres[0].value} titles).`);
  if (s.favouriteGenre && s.favouriteGenre !== s.genres[0]?.label) out.push(`You rate ${s.favouriteGenre} highest on average.`);
  if (s.vsImdb !== null && s.vsImdbCount >= 3 && Math.abs(s.vsImdb) >= 0.3) {
    out.push(s.vsImdb > 0
      ? `You're generous: ${s.vsImdb.toFixed(1)} points above ${s.crowdSource} on average.`
      : `You're a tough critic: ${Math.abs(s.vsImdb).toFixed(1)} points below ${s.crowdSource} on average.`);
  }
  if (s.streakWeeks >= 2) out.push(`You're on a ${s.streakWeeks}-week watching streak. Keep it going!`);
  if (s.weeksToClear !== null && s.backlogCount > 0) out.push(`At your current pace you'd clear your ${s.backlogCount}-title backlog in about ${s.weeksToClear} week${s.weeksToClear === 1 ? '' : 's'}.`);
  const decade = [...s.decades].sort((a, b) => b.value - a.value)[0];
  if (decade && s.decades.length > 1 && decade.value >= 3) out.push(`Most of your titles are from the ${decade.label}.`);
  if (s.filmMinutes && s.seriesMinutes) {
    const pct = Math.round((s.seriesMinutes / (s.filmMinutes + s.seriesMinutes)) * 100);
    out.push(`${pct}% of your watch time goes to series.`);
  }
  return out.slice(0, 4);
}

export function fmtDuration(mins: number): string {
  if (!mins) return '0h';
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  if (h >= 48) return `${Math.round(mins / 60).toLocaleString()}h`;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
