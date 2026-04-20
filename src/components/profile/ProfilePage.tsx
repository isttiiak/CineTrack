import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Film, Tv, Clock, Calendar, Star, MonitorPlay } from 'lucide-react';
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

    return {
      total: entries.length,
      watched: watched.length, watching: watching.length, plan: plan.length,
      watchedMins, planMins,
      last12, topMonth,
      platforms: Object.entries(platforms).sort((a,b)=>b[1]-a[1]).slice(0,6),
      topGenres, films, series,
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

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total',         value: S.total,    color: 'var(--accent-purple)',       sub: null },
            { label: 'Watched',       value: S.watched,  color: 'var(--accent-green)',        sub: fmtHours(S.watchedMins) },
            { label: 'Watching',      value: S.watching, color: 'var(--accent-yellow)',       sub: null },
            { label: 'Plan to Watch', value: S.plan,     color: 'var(--status-plan-text)',    sub: fmtHours(S.planMins) + ' ahead' },
          ].map(({ label, value, color, sub }) => (
            <div key={label} className="rounded-xl border p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <p className="text-3xl font-bold font-mono" style={{ color }}>{value}</p>
              <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
              {sub && <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-disabled)' }}>{sub}</p>}
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

        {/* Hours summary footer */}
        <div className="mt-4 flex flex-wrap gap-3">
          {S.watchedMins > 0 && (
            <div className="flex items-center gap-2 rounded-xl border px-3 py-2"
                 style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
              <Clock className="h-3.5 w-3.5" style={{ color: 'var(--accent-green)' }} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-mono font-bold" style={{ color: 'var(--accent-green)' }}>{fmtHours(S.watchedMins)}</span> watched
              </span>
            </div>
          )}
          {S.planMins > 0 && (
            <div className="flex items-center gap-2 rounded-xl border px-3 py-2"
                 style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
              <Clock className="h-3.5 w-3.5" style={{ color: 'var(--accent-purple)' }} />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-mono font-bold" style={{ color: 'var(--accent-purple)' }}>{fmtHours(S.planMins)}</span> still to watch
              </span>
            </div>
          )}
        </div>

      </div>
    </motion.div>
  );
}
