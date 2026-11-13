import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, Activity, Star, Film, Flame, Hourglass, Clock, Sparkles, Globe, MonitorPlay, Layers, Scale } from 'lucide-react';
import type { WatchlistState, UserProfile as UserProfileType } from '@/types';
import { computeStats, fmtDuration, type Bar, type Period } from '@/lib/stats';
import { cn } from '@/lib/utils';

interface Props {
  state: WatchlistState;
  user: UserProfileType | null;
  onClose: () => void;
}

const card = 'rounded-2xl border p-4 sm:p-5';
const cardStyle = { background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };

function Card({ title, icon, right, children, className }: { title: string; icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn(card, className)} style={cardStyle}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{icon}{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{children}</p>;

/** Hero number tile. */
function Tile({ label, value, sub, icon }: { label: string; value: string; sub?: string | null; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3.5 sm:p-4" style={cardStyle}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>{icon}{label}</div>
      <p className="font-mono text-2xl font-bold leading-none sm:text-[28px]" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="mt-1.5 text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

/**
 * Vertical bars, one series, single hue. Hovering (or focusing/tapping) a bar shows its value;
 * the highest bar is labelled directly. Thin baseline, no gridlines.
 */
function Columns({ bars, unit, height = 120, describe }: { bars: Bar[]; unit: string; height?: number; describe: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const peak = bars.reduce((p, b) => (b.value > p.value ? b : p), bars[0]);
  return (
    <div role="img" aria-label={describe}>
      {/* Top padding keeps the peak label inside the chart instead of over the card header. */}
      <div className="flex items-end gap-[2px] pt-6 sm:gap-1" style={{ height: height + 24 }}>
        {bars.map((b) => (
          <div key={b.key} tabIndex={0} className="group relative flex h-full flex-1 flex-col justify-end outline-none">
            <span
              className={cn(
                'pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold shadow transition-opacity',
                b === peak && b.value > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus:opacity-100',
              )}
              style={{ bottom: `calc(${(b.value / max) * 100}% + 4px)`, background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
            >
              {b.value} {unit}{b.extra ? ` · ${b.extra}` : ''}
            </span>
            <div
              className="w-full rounded-t-[4px] transition-all duration-500 group-hover:brightness-110"
              style={{ height: b.value ? `${Math.max((b.value / max) * 100, 3)}%` : '2px', background: b.value ? 'var(--viz-seq)' : 'var(--bg-elevated)' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] border-t pt-1 sm:gap-1" style={{ borderColor: 'var(--border-subtle)' }}>
        {bars.map((b) => <span key={b.key} className="flex-1 text-center text-[9px] sm:text-[10px]" style={{ color: 'var(--text-muted)' }}>{b.label}</span>)}
      </div>
    </div>
  );
}

/** Horizontal bars with the value at the end (labels in text colours, bar carries the hue). */
function Rows({ bars, max, format = (b) => String(b.value), note }: { bars: Bar[]; max?: number; format?: (b: Bar) => string; note?: (b: Bar) => React.ReactNode }) {
  const top = max ?? Math.max(1, ...bars.map((b) => b.value));
  return (
    <ul className="space-y-2.5">
      {bars.map((b) => (
        <li key={b.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{b.label}</span>
            <span className="flex-shrink-0 font-mono" style={{ color: 'var(--text-primary)' }}>{format(b)}{note?.(b)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-elevated)' }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(b.value / top) * 100}%`, background: 'var(--viz-seq)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const HEAT = ['var(--bg-elevated)', 'var(--viz-heat-1)', 'var(--viz-heat-2)', 'var(--viz-heat-3)', 'var(--viz-heat-4)'];
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Heatmap({ cells }: { cells: { date: string; count: number }[] }) {
  // Open at the most recent weeks (the strip scrolls sideways on small screens).
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, [cells]);
  const max = Math.max(1, ...cells.map((c) => c.count));
  const level = (n: number) => (n <= 0 ? 0 : Math.min(4, Math.ceil((n / Math.max(max, 4)) * 4)));
  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <div>
      <div ref={scroller} className="overflow-x-auto pb-1">
        <div className="flex gap-[3px]" style={{ minWidth: weeks.length * 14 + 28 }}>
          <div className="mr-1 flex flex-col gap-[3px] pt-4">
            {DAY_LABELS.map((d, i) => <div key={i} className="h-[11px] text-[9px] leading-[11px]" style={{ color: 'var(--text-muted)' }}>{d}</div>)}
          </div>
          {weeks.map((week, wi) => {
            const first = week.find((c) => c.date.endsWith('-01') || (wi === 0 && c === week[0]));
            return (
              <div key={wi} className="flex flex-col gap-[3px]">
                <div className="h-4 whitespace-nowrap text-[9px] leading-4" style={{ color: 'var(--text-muted)' }}>
                  {first && first.date.endsWith('-01') ? MONTHS[+first.date.slice(5, 7) - 1] : ''}
                </div>
                {week.map((c) => (
                  <div
                    key={c.date}
                    className="h-[11px] w-[11px] rounded-[2px]"
                    style={{ background: c.count < 0 ? 'transparent' : HEAT[level(c.count)] }}
                    title={c.count < 0 ? undefined : `${c.count} watched · ${c.date}`}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        Less {HEAT.map((h, i) => <span key={i} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: h }} />)} More
      </div>
    </div>
  );
}

/** Two-part share bar (films vs series) with a 2px gap, a legend and direct values. */
function Split({ a, b }: { a: { label: string; value: number; text: string }; b: { label: string; value: number; text: string } }) {
  const total = a.value + b.value || 1;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {a.value > 0 && <div style={{ width: `${(a.value / total) * 100}%`, background: 'var(--viz-1)' }} />}
        {b.value > 0 && <div style={{ width: `${(b.value / total) * 100}%`, background: 'var(--viz-2)' }} />}
      </div>
      <div className="mt-2.5 flex flex-wrap justify-between gap-2 text-xs">
        {[{ ...a, c: 'var(--viz-1)' }, { ...b, c: 'var(--viz-2)' }].map((s) => (
          <span key={s.label} className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.c }} />
            {s.label} <b className="font-mono" style={{ color: 'var(--text-primary)' }}>{s.text}</b>
            <span style={{ color: 'var(--text-muted)' }}>({Math.round((s.value / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProfilePage({ state, user, onClose }: Props) {
  const [period, setPeriod] = useState<Period>('all');
  const S = useMemo(() => computeStats(state, period), [state, period]);
  const periodLabel = period === 'all' ? 'all time' : period;
  const hasDates = S.years.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-40 overflow-y-auto"
      style={{ background: 'var(--bg-base)' }}
    >
      <div className="mx-auto max-w-4xl px-4 py-6 pb-20 sm:py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold sm:text-2xl" style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>Your analytics</h1>
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="Period"
              className="h-9 rounded-lg border bg-transparent px-2 text-sm font-medium"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
            >
              <option value="all">All time</option>
              {S.years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={onClose} className="rounded-xl p-2 transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} aria-label="Close analytics">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {user && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border p-4" style={cardStyle}>
            {user.avatar
              ? <img src={user.avatar} alt="" className="h-11 w-11 flex-shrink-0 rounded-full" />
              : <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-bold text-indigo-400">{user.name[0]}</div>}
            <div className="min-w-0">
              <p className="truncate font-bold" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{S.total} titles · {S.byStatus.watched} watched · {S.byStatus.watching} watching · {S.byStatus.plan} planned</p>
            </div>
          </div>
        )}

        {S.insights.length > 0 && (
          <section className={cn(card, 'mb-4')} style={{ ...cardStyle, background: 'color-mix(in srgb, var(--accent-purple) 7%, var(--bg-surface))' }}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}><Sparkles className="h-4 w-4" style={{ color: 'var(--accent-purple)' }} />Insights</h2>
            <ul className="space-y-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {S.insights.map((t) => <li key={t}>• {t}</li>)}
            </ul>
          </section>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            icon={<Film className="h-3.5 w-3.5" />} label={`Watched · ${periodLabel}`} value={String(S.watchedInPeriod)}
            sub={period === 'all' ? `${S.last30} in the last 30 days` : `${S.avgPerMonth} a month on average`}
          />
          <Tile
            icon={<Clock className="h-3.5 w-3.5" />} label="Time watched" value={fmtDuration(S.minutesWatched)}
            sub={S.minutesUnknown ? `+${S.minutesUnknown} series of unknown length` : `${(S.minutesWatched / 60 / 24).toFixed(1)} days of viewing`}
          />
          <Tile
            icon={<Flame className="h-3.5 w-3.5" />} label="Weekly streak" value={`${S.streakWeeks} wk`}
            sub={hasDates ? `Longest: ${S.longestStreakWeeks} week${S.longestStreakWeeks === 1 ? '' : 's'}` : 'Mark titles watched to start one'}
          />
          <Tile
            icon={<Hourglass className="h-3.5 w-3.5" />} label="Backlog" value={String(S.backlogCount)}
            sub={[S.backlogMinutes ? `~${fmtDuration(S.backlogMinutes)}` : null, S.weeksToClear ? `~${S.weeksToClear} wk at your pace` : null].filter(Boolean).join(' · ') || null}
          />
        </div>

        <div className="mb-4 grid gap-4 lg:grid-cols-5">
          <Card
            className="lg:col-span-3"
            title={period === 'all' ? 'Watched per month' : `Watched per month in ${period}`}
            icon={<Calendar className="h-4 w-4" style={{ color: 'var(--viz-seq)' }} />}
            right={S.peakMonth && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Avg {S.avgPerMonth}/month</span>}
          >
            {S.months.some((m) => m.value)
              ? <Columns bars={S.months} unit="watched" describe={`Titles watched per month, peak ${S.peakMonth?.label} with ${S.peakMonth?.value}`} />
              : <Empty>Mark titles as watched to see your monthly activity.</Empty>}
          </Card>
          <Card className="lg:col-span-2" title="Watch time: films vs series" icon={<Layers className="h-4 w-4" style={{ color: 'var(--viz-1)' }} />}>
            {S.filmMinutes + S.seriesMinutes > 0
              ? <Split a={{ label: 'Films', value: S.filmMinutes, text: fmtDuration(S.filmMinutes) }} b={{ label: 'Series', value: S.seriesMinutes, text: fmtDuration(S.seriesMinutes) }} />
              : <Empty>Runtime appears once watched titles have a duration.</Empty>}
            <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>In your list: {S.films} films · {S.series} series</p>
          </Card>
        </div>

        {hasDates && (
          <Card className="mb-4" title={period === 'all' ? 'Last 12 months, day by day' : `${period}, day by day`} icon={<Activity className="h-4 w-4" style={{ color: 'var(--viz-seq)' }} />}>
            <Heatmap cells={S.heatmap} />
          </Card>
        )}

        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <Card
            title="Your ratings" icon={<Star className="h-4 w-4" style={{ color: 'var(--accent-yellow)' }} />}
            right={S.avgRating !== null && <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>avg {S.avgRating}/10 · {S.ratedCount} rated</span>}
          >
            {S.ratedCount
              ? <Columns bars={S.ratingHistogram} unit="titles" height={96} describe={`Distribution of your ratings, average ${S.avgRating}`} />
              : <Empty>Rate titles (1–10) to see how you score things.</Empty>}
          </Card>

          <Card title="You vs the crowd" icon={<Scale className="h-4 w-4" style={{ color: 'var(--accent-yellow)' }} />}
            right={S.vsImdb !== null && <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{S.vsImdb > 0 ? '+' : ''}{S.vsImdb} avg</span>}>
            {S.vsImdbCount === 0 ? <Empty>Rate titles that have an IMDb or TMDB score to compare your taste with everyone else's.</Empty> : (
              <div className="grid gap-3 text-xs">
                <p style={{ color: 'var(--text-secondary)' }}>
                  {S.vsImdb === 0 ? `You agree with ${S.crowdSource} on average.` : S.vsImdb! > 0
                    ? `You rate ${S.vsImdb} points higher than ${S.crowdSource} on average.`
                    : `You rate ${Math.abs(S.vsImdb!)} points lower than ${S.crowdSource} on average.`}
                </p>
                {[['You liked more', S.lovedMore], ['You liked less', S.lovedLess]].map(([label, list]) => (list as typeof S.lovedMore).length > 0 && (
                  <div key={label as string}>
                    <p className="mb-1 font-semibold" style={{ color: 'var(--text-muted)' }}>{label as string}</p>
                    <ul className="space-y-1">
                      {(list as typeof S.lovedMore).map((p) => (
                        <li key={p.entry.id} className="flex justify-between gap-2">
                          <span className="truncate" style={{ color: 'var(--text-primary)' }}>{p.entry.title}</span>
                          <span className="flex-shrink-0 font-mono" style={{ color: 'var(--text-secondary)' }}>you {p.mine} · {p.source} {p.imdb}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <Card title="Top genres" icon={<Sparkles className="h-4 w-4" style={{ color: 'var(--viz-seq)' }} />}
            right={S.favouriteGenre && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Highest rated: <b style={{ color: 'var(--text-primary)' }}>{S.favouriteGenre}</b></span>}>
            {S.genres.length
              ? <Rows bars={S.genres} note={(b) => { const r = (b as typeof S.genres[number]).avgRating; return r !== null ? <span style={{ color: 'var(--text-muted)' }}> · ★{r}</span> : null; }} />
              : <Empty>No genres yet.</Empty>}
          </Card>
          <Card title="By decade" icon={<Calendar className="h-4 w-4" style={{ color: 'var(--viz-seq)' }} />}>
            {S.decades.length
              ? <Columns bars={S.decades} unit="titles" height={110} describe="Titles by release decade" />
              : <Empty>No release years yet.</Empty>}
          </Card>
        </div>

        <div className="mb-4 grid gap-4 md:grid-cols-3">
          <Card title="Countries" icon={<Globe className="h-4 w-4" style={{ color: 'var(--viz-seq)' }} />}>
            {S.countries.length ? <Rows bars={S.countries} /> : <Empty>No countries yet.</Empty>}
          </Card>
          <Card title="Platforms" icon={<MonitorPlay className="h-4 w-4" style={{ color: 'var(--viz-seq)' }} />}>
            {S.platforms.length ? <Rows bars={S.platforms} /> : <Empty>Set a platform on titles to see where you watch.</Empty>}
          </Card>
          <Card title="Sections completed" icon={<Layers className="h-4 w-4" style={{ color: 'var(--viz-seq)' }} />}>
            {S.sections.length
              ? <Rows bars={S.sections} max={100} format={(b) => { const s = b as typeof S.sections[number]; return `${s.done}/${s.total}`; }} />
              : <Empty>No sections yet.</Empty>}
          </Card>
        </div>

        {S.watchedUndated > 0 && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {S.watchedUndated} watched title{S.watchedUndated === 1 ? ' has' : 's have'} no watch date, so {S.watchedUndated === 1 ? "it isn't" : "they aren't"} in the monthly and daily charts.
          </p>
        )}
      </div>
    </motion.div>
  );
}
