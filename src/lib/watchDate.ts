/**
 * "Watched on" with the precision you actually remember.
 *
 * Stored as `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, so "sometime in 2019", "March 2024" and
 * "13 Nov 2026" are all valid. Plain strings keep the sync merge simple (it compares primitives)
 * and sort chronologically, and older data (always full dates) stays valid.
 */

export type DatePrecision = 'year' | 'month' | 'day';
export interface WatchDateParts { year: number; month?: number; day?: number }

export const MIN_YEAR = 1888;   // the first film
const MAX_YEAR = 2100;

const pad = (n: number) => String(n).padStart(2, '0');
export const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** Parses `YYYY`, `YYYY-MM` or `YYYY-MM-DD`; null for anything else, including impossible dates (2026-02-30). */
export function parseWatchDate(value: unknown): WatchDateParts | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!m) return null;
  const year = +m[1];
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (m[2] === undefined) return { year };
  const month = +m[2];
  if (month < 1 || month > 12) return null;
  if (m[3] === undefined) return { year, month };
  const day = +m[3];
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export const isValidWatchDate = (value: unknown): value is string => parseWatchDate(value) !== null;

/** Builds the stored string. A year is required, and a day needs a month. Returns undefined when empty or invalid. */
export function buildWatchDate(p: { year?: number | null; month?: number | null; day?: number | null }): string | undefined {
  if (!p.year) return undefined;
  const parts = [String(p.year).padStart(4, '0')];
  if (p.month) {
    parts.push(pad(p.month));
    if (p.day) parts.push(pad(p.day));
  }
  const s = parts.join('-');
  return isValidWatchDate(s) ? s : undefined;
}

export function precisionOf(value: string | undefined): DatePrecision | null {
  const p = parseWatchDate(value);
  if (!p) return null;
  return p.day ? 'day' : p.month ? 'month' : 'year';
}

/** "2026" · "Mar 2026" · "13 Nov 2026" (in the reader's locale). */
export function formatWatchDate(value: string | undefined, locale?: string): string {
  const p = parseWatchDate(value);
  if (!p) return '';
  if (!p.month) return String(p.year);
  const date = new Date(p.year, p.month - 1, p.day ?? 1);
  return p.day
    ? date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    : date.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

/** The newest values allowed ("can't have watched it tomorrow"), given today. */
export function latestAllowed(now = new Date()): { year: number; month: number; day: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Clamps a date that lies in the future back to the most recent allowed date at the same precision. */
export function clampToPast(value: string | undefined, now = new Date()): string | undefined {
  const p = parseWatchDate(value);
  if (!p) return undefined;
  const max = latestAllowed(now);
  if (p.year > max.year) return buildWatchDate({ year: max.year, month: p.month ? max.month : undefined, day: p.day ? max.day : undefined });
  if (p.year === max.year && p.month && p.month > max.month) return buildWatchDate({ year: p.year, month: max.month, day: p.day ? max.day : undefined });
  if (p.year === max.year && p.month === max.month && p.day && p.day > max.day) return buildWatchDate({ year: p.year, month: p.month, day: max.day });
  return value;
}

export const todayWatchDate = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

export function yesterdayWatchDate(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return todayWatchDate(d);
}
