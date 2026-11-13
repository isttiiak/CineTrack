import { useState } from 'react';
import { X, CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onSignIn: () => void;
}

const KEY = 'cinetrack_banner_dismissed_until';
const SNOOZE_DAYS = 14;

function isSnoozed(): boolean {
  try { return Date.now() < Number(localStorage.getItem(KEY) ?? 0); } catch { return false; }
}

/** Guest prompt to sign in. Compact on phones; dismissing it hides it for two weeks. */
export function AuthBanner({ onSignIn }: Props) {
  const [dismissed, setDismissed] = useState(isSnoozed);
  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000)); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <div className="mb-4 sm:mb-5">
      <div
        className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 sm:gap-3 sm:px-4 sm:py-3"
        style={{ borderColor: 'var(--accent-purple)', background: 'color-mix(in srgb, var(--accent-purple) 8%, var(--bg-surface))' }}
      >
        <div className="flex min-w-0 items-center gap-2 text-xs sm:gap-2.5 sm:text-sm">
          <CloudUpload className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--accent-purple)' }} />
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            <span className="sm:hidden">Sync your list across devices</span>
            <span className="hidden sm:inline">Sign in with Google to sync your watchlist across all devices.</span>
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
          <Button size="sm" onClick={onSignIn} className="h-8 px-3 text-xs sm:text-sm">
            <span className="sm:hidden">Sign in</span><span className="hidden sm:inline">Sign in with Google</span>
          </Button>
          <button
            onClick={dismiss}
            className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Dismiss for two weeks"
            title="Hide for two weeks"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
