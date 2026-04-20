import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Film, Calendar, MonitorPlay, Activity, Star } from 'lucide-react';
import type { WatchlistState, UserProfile as UserProfileType } from '@/types';

interface Props {
  state: WatchlistState;
  user: UserProfileType | null;
  onClose: () => void;
}

function parseMins(d?: string): number {
  if (!d) return 0;
  let t = 0;
  const h = d.match(/(\d+)\s*h/i);   if (h) t += parseInt(h[1]) * 60;
  const m = d.match(/(\d+)\s*m(?:in)?/i); if (m) t += parseInt(m[1]);
  return t;
}

function fmtHours(mins: number): string {
  if (!mins) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function HeatmapGrid({ cells }: { cells: { date: string; count: number }[] }) {
  const maxCount = Math.max(...cells.map(c => c.count), 1);
  // Group into columns of 7 (weeks)
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  // Month labels: find first cell of each month
  const monthLabels: { weekIdx: number; label: string }[] = [];
  weeks.forEach((week, wi) => {
    week.forEach(cell => {
      if (cell.date.endsWith('-01')) {
        const mo = parseInt(cell.date.slice(5, 7)) - 1;
        monthLabels.push({ weekIdx: wi, label: MONTH_NAMES[mo] });
      }
    });
  });

  function cellColor(count: number) {
    if (count === 0) return 'var(--bg-elevated)';
    const intensity = Math.min(count / Math.max(maxCount, 3), 1);
    if (intensity < 0.33) return 'color-mix(in srgb, var(--accent-green) 30%, transparent)';
    if (intensity < 0.66) return 'color-mix(in srgb, var(--accent-green) 60%, transparent)';
    return 'var(--accent-green)';
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0.5" style={{ minWidth: `${weeks.length * 13}px` }}>
        {/* Day labels */}
        <div className="flex flex-col gap-0.5 mr-1">
          <div className="h-4" /> {/* month label spacer */}
          {DAY_LABELS.map((d, i) => (
            <div key={d} className="h-[11px] text-[8px] flex items-center" style={{ color: 'var(--text-disabled)', visibility: i % 2 === 1 ? 'visible' : 'hidden' }}>
              {d}
            </div>
          ))}
        </div>
        {/* Weeks */}
        {weeks.map((week, wi) => {
          const monthLabel = monthLabels.find(m => m.weekIdx === wi);
          return (
            <div key={wi} className="flex flex-col gap-0.5">
              <div className="h-4 text-[8px] leading-4 whitespace-nowrap" style={{ color: 'var(--text-disabled)' }}>
                {monthLabel?.label ?? ''}
              </div>
              {week.map(cell => (
                <div
                  key={cell.date}
                  className="h-[11px] w-[11px] rounded-[2px] transition-opacity hover:opacity-80"
                  style={{ background: cellColor(cell.count) }}
                  title={cell.count > 0 ? `${cell.count} watched on ${cell.date}` : cell.date}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProfilePage({ state, user, onClose }: Props) {
  const S = useMemo(() => {
    const entries = state.entries;
    const metaList = Object.values(state.meta);

    const watched  = metaList.filter(m => m.status === 'watched');
    const watching = metaList.filter(m => m.status === 'watching');
    const plan     = metaList.filter(m => m.status === 'plan');

    const watchedMins = watched.reduce((s, m) => s + parseMins(m.duration), 0);
    const planMins    = plan.reduce((s, m)    => s + parseMins(m.duration), 0);

    // Monthly watched counts (last 12 months)
    const monthMap: Record<string, number> = {};
    for (const m of watched) {
      if (!m.watchedOn) continue;
      const [y, mo] = m.watchedOn.split('-');
      monthMap[`${y}-${mo}`] = (monthMap[`${y}-${mo}`] || 0) + 1;
    }
    const now = new Date();
    const last12 = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      return { label: MONTH_NAMES[d.getMonth()], key, count: monthMap[key] || 0 };
    });

    const topMonthEntry = Object.entries(monthMap).sort((a, b) => b[1] - a[1])[0];
    const topMonth = topMonthEntry
      ? (() => { const [y,mo] = topMonthEntry[0].split('-'); return `${MONTH_NAMES[+mo-1]} ${y} (${topMonthEntry[1]})`; })()
      : null;

    // Platform breakdown
    const platforms: Record<string, number> = {};
    for (const m of metaList) if (m.watchPlatform) platforms[m.watchPlatform] = (platforms[m.watchPlatform]||0)+1;

    // Genre breakdown
    const genres: Record<string, number> = {};
    for (const e of entries)
      e.genre.split(',').map(g => g.trim()).filter(Boolean).forEach(g => { genres[g] = (genres[g]||0)+1; });
    const topGenres = Object.entries(genres).sort((a,b)=>b[1]-a[1]).slice(0,6);

    const films  = entries.filter(e => e.type === 'Film').length;
    const series = entries.filter(e => e.type === 'Series').length;

    // Heatmap: last 52 weeks (364 days) of watch activity
    const dayMap: Record<string, number> = {};
    for (const m of watched) {
      if (!m.watchedOn) continue;
      dayMap[m.watchedOn] = (dayMap[m.watchedOn] || 0) + 1;
    }
    const today = new Date();
    // Start from Sunday 52 weeks ago
    const startDay = new Date(today);
    startDay.setDate(startDay.getDate() - 363);
    const dayOfWeek = startDay.getDay(); // 0=Sun
    startDay.setDate(startDay.getDate() - dayOfWeek);
    const heatmap: { date: string; count: number }[] = [];
    for (let i = 0; i < 371; i++) {
      const d = new Date(startDay);
      d.setDate(d.getDate() + i);
      if (d > today) break;
      const key = d.toISOString().slice(0, 10);
      heatmap.push({ date: key, count: dayMap[key] || 0 });
    }

    // Average personal rating
    const ratings = metaList.filter(m => m.personalRating != null).map(m => m.personalRating!);
    const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

    return {
      total: entries.length,
      watched: watched.length, watching: watching.length, plan: plan.length,
      watchedMins, planMins,
      last12, topMonth,
      platforms: Object.entries(platforms).sort((a,b)=>b[1]-a[1]).slice(0,6),
      topGenres, films, series,
      heatmap, avgRating,
    };
  }, [state]);

  const maxBar      = Math.max(...S.last12.map(m => m.count), 1);
  const maxPlatform = S.platforms[0]?.[1] || 1;
  const maxGenre    = S.topGenres[0]?.[1]  || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-40 overflow-y-auto"
      style={{ background: 'var(--bg-base)' }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8 pb-20">

        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>
            Profile &amp; Stats
          </h1>
          <button
            onClick={onClose}
            className="rounded-xl p-2 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User card */}
        {user && (
          <div
            className="rounded-2xl border p-5 mb-5 flex items-center gap-4"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            {user.avatar
              ? <img src={user.avatar} alt={user.name} className="h-14 w-14 rounded-full ring-2 ring-indigo-500/30 flex-shrink-0" />
              : <div className="h-14 w-14 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl font-bold text-indigo-400">{user.name[0]}</span>
                </div>
            }
            <div className="min-w-0">
              <p className="font-bold text-lg truncate" style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>
                {user.name}
              </p>
              <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{user.email}</p>
            </div>
          </div>
        )}

        {/* Summary stats — 5 cards: 2 cols mobile, 3 cols sm, 5 cols lg */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          {[
            {
              label: 'Total', value: S.total, color: 'var(--accent-purple)',
              sub: `${S.films} films · ${S.series} series`,
            },
            {
              label: 'Watched', value: S.watched, color: 'var(--accent-green)',
              sub: S.watchedMins > 0 ? fmtHours(S.watchedMins) + ' watched' : null,
            },
            {
              label: 'Watching', value: S.watching, color: 'var(--accent-yellow)',
              sub: null,
            },
            {
              label: 'Plan to Watch', value: S.plan, color: 'var(--status-plan-text)',
              sub: S.planMins > 0 ? fmtHours(S.planMins) + ' queued' : null,
            },
            {
              label: 'Avg Rating', value: S.avgRating ? `${S.avgRating}/10` : '—', color: 'var(--accent-yellow)',
              sub: S.avgRating ? `from ${Object.values(state.meta).filter(m => m.personalRating != null).length} rated` : 'no ratings yet',
              mono: true,
            },
          ].map(({ label, value, color, sub }) => (
            <div key={label} className="rounded-xl border p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <p className="text-2xl sm:text-3xl font-bold font-mono leading-none" style={{ color }}>{value}</p>
              <p className="text-xs font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
              {sub && <p className="text-[10px] mt-1 font-mono leading-snug" style={{ color: 'var(--text-disabled)' }}>{sub}</p>}
            </div>
          ))}
        </div>

        {/* Monthly activity chart */}
        <div className="rounded-2xl border p-5 mb-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Calendar className="h-4 w-4" style={{ color: 'var(--accent-purple)' }} />
              Monthly Activity
            </h2>
            {S.topMonth && (
              <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: 'var(--accent-purple)', borderColor: 'var(--accent-purple)', background: 'color-mix(in srgb, var(--accent-purple) 10%, transparent)' }}>
                Peak: {S.topMonth}
              </span>
            )}
          </div>
          <div className="flex items-end gap-1 h-28">
            {S.last12.map(({ label, key, count }) => (
              <div key={key} className="flex-1 flex flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-t transition-all duration-500"
                  style={{
                    height: `${Math.max((count / maxBar) * 100, count > 0 ? 6 : 2)}%`,
                    background: count > 0
                      ? 'linear-gradient(to top, var(--accent-purple), var(--accent-blue))'
                      : 'var(--bg-elevated)',
                    opacity: count > 0 ? 0.4 + (count / maxBar) * 0.6 : 1,
                  }}
                />
                <span className="text-[9px]" style={{ color: 'var(--text-disabled)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Watch History Heatmap */}
        {S.heatmap.some(d => d.count > 0) && (
          <div className="rounded-2xl border p-5 mb-5 overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Activity className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
              Watch History
              <span className="text-xs font-normal ml-auto" style={{ color: 'var(--text-disabled)' }}>last 12 months</span>
            </h2>
            <HeatmapGrid cells={S.heatmap} />
          </div>
        )}

        {/* Film vs Series  +  Platforms */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Film className="h-4 w-4" style={{ color: 'var(--accent-cyan)' }} />
              Film vs Series
            </h2>
            <div className="space-y-3">
              {[
                { label: 'Films',  count: S.films,  color: 'var(--accent-cyan)' },
                { label: 'Series', count: S.series, color: 'var(--accent-pink)' },
              ].map(({ label, count, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    <span className="font-mono font-bold" style={{ color }}>{count}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                         style={{ width: `${S.total ? (count / S.total) * 100 : 0}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <MonitorPlay className="h-4 w-4" style={{ color: 'var(--accent-green)' }} />
              Platforms
            </h2>
            {S.platforms.length === 0
              ? <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>No platform data yet.</p>
              : <div className="space-y-2.5">
                  {S.platforms.map(([p, count]) => (
                    <div key={p}>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: 'var(--text-secondary)' }}>{p}</span>
                        <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                        <div className="h-full rounded-full transition-all duration-700"
                             style={{ width: `${(count / maxPlatform) * 100}%`, background: 'var(--accent-green)' }} />
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>

        {/* Top Genres */}
        {S.topGenres.length > 0 && (
          <div className="rounded-2xl border p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Star className="h-4 w-4" style={{ color: 'var(--accent-yellow)' }} />
              Top Genres
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
              {S.topGenres.map(([genre, count]) => (
                <div key={genre}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: 'var(--text-secondary)' }}>{genre}</span>
                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                         style={{ width: `${(count / maxGenre) * 100}%`, background: 'var(--accent-yellow)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


      </div>
    </motion.div>
  );
}
