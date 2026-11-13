import { useMemo } from 'react';
import {
  buildWatchDate, clampToPast, daysInMonth, formatWatchDate, latestAllowed, MIN_YEAR,
  parseWatchDate, todayWatchDate, yesterdayWatchDate,
} from '@/lib/watchDate';
import { cn } from '@/lib/utils';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MIN_LISTED_YEAR = 1920;   // older years are still accepted if already stored

const selectClass = 'h-9 min-w-0 flex-1 rounded-lg border px-2 text-sm font-medium outline-none transition-colors focus:ring-2 focus:ring-[var(--border-focus)]/50 disabled:cursor-not-allowed disabled:opacity-40';
const selectStyle = { background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };

interface Props {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Show Today / Yesterday / Clear shortcuts. */
  quick?: boolean;
  /** Show "Saved as …". */
  preview?: boolean;
  idPrefix?: string;
  className?: string;
}

/**
 * Picks a watch date at the precision the user remembers: a year, then optionally a month, then
 * optionally a day. Stores `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, never a date in the future.
 */
export function WatchDateField({ value, onChange, quick = true, preview = true, idPrefix = 'watch-date', className }: Props) {
  const now = new Date();
  const max = latestAllowed(now);
  const parts = parseWatchDate(value);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = max.year; y >= MIN_LISTED_YEAR; y--) list.push(y);
    if (parts && parts.year < MIN_LISTED_YEAR && parts.year >= MIN_YEAR) list.push(parts.year);
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max.year, parts?.year]);

  const monthLimit = parts?.year === max.year ? max.month : 12;
  const dayLimit = parts?.year && parts.month
    ? (parts.year === max.year && parts.month === max.month ? max.day : daysInMonth(parts.year, parts.month))
    : 31;

  const emit = (next: { year?: number | null; month?: number | null; day?: number | null }) =>
    onChange(clampToPast(buildWatchDate(next), now));

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex gap-2">
        <select
          id={`${idPrefix}-year`} aria-label="Year" className={selectClass} style={selectStyle}
          value={parts?.year ?? ''}
          onChange={(e) => e.target.value
            ? emit({ year: +e.target.value, month: parts?.month, day: parts?.day })
            : onChange(undefined)}
        >
          <option value="">Year</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          id={`${idPrefix}-month`} aria-label="Month (optional)" className={selectClass} style={selectStyle}
          value={parts?.month ?? ''} disabled={!parts}
          onChange={(e) => emit({ year: parts?.year, month: e.target.value ? +e.target.value : null, day: e.target.value ? parts?.day : null })}
        >
          <option value="">Month</option>
          {MONTHS.slice(0, monthLimit).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select
          id={`${idPrefix}-day`} aria-label="Day (optional)" className={cn(selectClass, 'max-w-[5.5rem]')} style={selectStyle}
          value={parts?.day ?? ''} disabled={!parts?.month}
          onChange={(e) => emit({ year: parts?.year, month: parts?.month, day: e.target.value ? +e.target.value : null })}
        >
          <option value="">Day</option>
          {Array.from({ length: dayLimit }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {(quick || preview) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {quick && (
            <>
              <button type="button" onClick={() => onChange(todayWatchDate(now))} className="rounded-md border px-2 py-1 font-semibold transition-colors hover:bg-[var(--bg-hover)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>Today</button>
              <button type="button" onClick={() => onChange(yesterdayWatchDate(now))} className="rounded-md border px-2 py-1 font-semibold transition-colors hover:bg-[var(--bg-hover)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>Yesterday</button>
              {value && (
                <button type="button" onClick={() => onChange(undefined)} className="rounded-md px-2 py-1 font-semibold transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>Clear</button>
              )}
            </>
          )}
          {preview && (
            <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>
              {value ? <>Saved as <b style={{ color: 'var(--text-primary)' }}>{formatWatchDate(value)}</b></> : 'Only remember the year? Pick just the year.'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
