import { useState } from 'react';
import { X, CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onSignIn: () => void;
}

export function AuthBanner({ onSignIn }: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 mb-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
        <div className="flex items-center gap-2.5 text-sm">
          <CloudUpload className="h-4 w-4 text-indigo-400 flex-shrink-0" />
          <span className="text-[var(--text-secondary)]">
            Sign in with Google to sync your watchlist across all devices — your data is never lost.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="sm" onClick={onSignIn}>Sign in with Google</Button>
          <button
            onClick={() => setDismissed(true)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
