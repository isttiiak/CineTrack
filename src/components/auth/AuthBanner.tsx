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
    <div className="mb-5">
      <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 border"
        style={{
          borderColor: 'var(--accent-purple)',
          background: 'color-mix(in srgb, var(--accent-purple) 8%, var(--bg-surface))',
        }}
      >
        <div className="flex items-center gap-2.5 text-sm">
          <CloudUpload className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--accent-purple)' }} />
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            Sign in with Google to sync your watchlist across all devices.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="sm" onClick={onSignIn}>Sign in with Google</Button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
