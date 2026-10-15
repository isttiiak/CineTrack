import { Moon, Sun, LogIn, Download, Upload, BarChart2, RefreshCw, CloudOff, Cloud, Loader2 } from 'lucide-react';
import { UserProfile } from './UserProfile';
import { Button } from '@/components/ui/button';
import type { WatchlistState, UserProfile as UserProfileType, ThemeMode, SyncStatus } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

interface Props {
  state: WatchlistState;
  user: UserProfileType | null;
  theme: ThemeMode;
  lastSync: string | null;
  syncStatus: SyncStatus;
  cloudError: boolean;
  onToggleTheme: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onExport: () => void;
  onImport: () => void;
  onProfile: () => void;
  onForceSync: () => void;
  onRetrySync: () => void;
}

function SyncIndicator({ status, cloudError, lastSync, onForceSync, onRetrySync }: Pick<Props, 'cloudError' | 'lastSync' | 'onForceSync' | 'onRetrySync'> & { status: SyncStatus }) {
  if (cloudError || status === 'error') {
    return (
      <button
        onClick={cloudError ? onRetrySync : onForceSync}
        className="flex items-center gap-1 rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
        title={cloudError ? 'Could not load your cloud list. Changes are kept on this device only.' : 'Last save failed'}
      >
        <CloudOff className="h-3 w-3" /> {cloudError ? 'Offline · Retry' : 'Sync failed · Retry'}
      </button>
    );
  }
  const busy = status === 'saving' || status === 'loading';
  return (
    <button
      onClick={onForceSync}
      disabled={busy}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-70"
      style={{ color: 'var(--text-muted)' }}
      title="Sync now"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : status === 'saved' ? <Cloud className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
      <span className="hidden sm:inline">{busy ? 'Syncing…' : lastSync ? `Synced ${formatRelativeTime(lastSync)}` : 'Sync'}</span>
    </button>
  );
}

export function Header({ state, user, theme, lastSync, syncStatus, cloudError, onToggleTheme, onSignIn, onSignOut, onExport, onImport, onProfile, onForceSync, onRetrySync }: Props) {
  // Count from entries (not meta values) so orphaned meta can't skew stats past 100%.
  const total = state.entries.length;
  const counts = { plan: 0, watching: 0, watched: 0 };
  for (const e of state.entries) counts[state.meta[e.id]?.status ?? 'plan']++;
  const progress = total > 0 ? Math.round((counts.watched / total) * 100) : 0;

  const iconBtn = 'rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors';

  return (
    <header className="sticky top-0 z-40 border-b backdrop-blur-xl" style={{ borderColor: 'var(--border-subtle)', background: 'color-mix(in srgb, var(--bg-base) 85%, transparent)' }}>
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <h1 className="hidden text-lg font-bold tracking-tight text-[var(--text-primary)] min-[400px]:block">
              Cine<span className="text-indigo-400">Track</span>
            </h1>
          </div>

          <div className="hidden items-center gap-4 text-sm md:flex" style={{ color: 'var(--text-muted)' }}>
            <span><span className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>{total}</span> total</span>
            <span><span className="font-mono text-base font-bold text-emerald-400">{counts.watched}</span> watched</span>
            <span><span className="font-mono text-base font-bold text-yellow-400">{counts.watching}</span> watching</span>
            <span><span className="font-mono text-base font-bold" style={{ color: 'var(--accent-purple)' }}>{counts.plan}</span> planned</span>
          </div>

          <div className="flex items-center gap-1.5">
            {user && (
              <SyncIndicator status={syncStatus} cloudError={cloudError} lastSync={lastSync} onForceSync={onForceSync} onRetrySync={onRetrySync} />
            )}
            <button onClick={onProfile} className={iconBtn} title="Stats & Profile" aria-label="Stats and profile">
              <BarChart2 className="h-4 w-4" />
            </button>
            {!user && (
              <>
                <button onClick={onToggleTheme} className={iconBtn} title="Toggle theme" aria-label="Toggle theme">
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button onClick={onImport} className={iconBtn} title="Import JSON" aria-label="Import JSON">
                  <Upload className="h-4 w-4" />
                </button>
                <button onClick={onExport} className={iconBtn} title="Export JSON" aria-label="Export JSON">
                  <Download className="h-4 w-4" />
                </button>
                <Button variant="outline" size="sm" onClick={onSignIn} className="whitespace-nowrap">
                  <LogIn className="h-3.5 w-3.5" /> Sign in
                </Button>
              </>
            )}
            {user && (
              <UserProfile user={user} theme={theme} onToggleTheme={onToggleTheme} onExport={onExport} onImport={onImport} onSignOut={onSignOut} />
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{progress}% watched</span>
        </div>
      </div>
    </header>
  );
}
