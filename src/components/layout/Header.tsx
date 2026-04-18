import { Moon, Sun, LogIn, Download } from 'lucide-react';
import { UserProfile } from './UserProfile';
import { Button } from '@/components/ui/button';
import type { WatchlistState, UserProfile as UserProfileType, ThemeMode } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

interface Props {
  state: WatchlistState;
  user: UserProfileType | null;
  theme: ThemeMode;
  lastSync: string | null;
  onToggleTheme: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onExport: () => void;
  onImport: () => void;
}

export function Header({ state, user, theme, lastSync, onToggleTheme, onSignIn, onSignOut, onExport, onImport }: Props) {
  const total = state.entries.length;
  const watched = Object.values(state.meta).filter((m) => m.status === 'watched').length;
  const watching = Object.values(state.meta).filter((m) => m.status === 'watching').length;
  const plan = Object.values(state.meta).filter((m) => m.status === 'plan').length;
  const progress = total > 0 ? Math.round((watched / total) * 100) : 0;

  return (
    <header className="sticky top-0 z-40 border-b backdrop-blur-xl" style={{ borderColor: 'var(--border-subtle)', background: 'color-mix(in srgb, var(--bg-base) 85%, transparent)' }}>
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="CineTrack" className="h-8 w-8 rounded-lg" />
            <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
              Cine<span className="text-indigo-400">Track</span>
            </h1>
          </div>

          {/* Stats */}
          <div className="hidden md:flex items-center gap-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <span><span className="font-mono font-bold text-base" style={{ color: 'var(--text-primary)' }}>{total}</span> total</span>
            <span><span className="font-mono font-bold text-base text-emerald-400">{watched}</span> watched</span>
            <span><span className="font-mono font-bold text-base text-yellow-400">{watching}</span> watching</span>
            <span><span className="font-mono font-bold text-base" style={{ color: 'var(--accent-purple)' }}>{plan}</span> planned</span>
            {lastSync && (
              <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>synced {formatRelativeTime(lastSync)}</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {!user && (
              <button
                onClick={onToggleTheme}
                className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}
            {!user && (
              <>
                <button
                  onClick={onExport}
                  className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                  title="Export JSON"
                >
                  <Download className="h-4 w-4" />
                </button>
                <Button variant="outline" size="sm" onClick={onSignIn}>
                  <LogIn className="h-3.5 w-3.5" />
                  Sign in
                </Button>
              </>
            )}
            {user && (
              <UserProfile
                user={user}
                theme={theme}
                onToggleTheme={onToggleTheme}
                onExport={onExport}
                onImport={onImport}
                onSignOut={onSignOut}
              />
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1 text-right text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{progress}% complete</div>
      </div>
    </header>
  );
}
