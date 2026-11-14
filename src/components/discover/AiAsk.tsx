import { Loader2, LogIn, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useAiSearch } from '@/hooks/useAiSearch';

type Ai = ReturnType<typeof useAiSearch>;

/**
 * The "Ask AI" prompt shown under a Discover search. Idle: an invitation (or a sign-in prompt, since
 * AI search is for signed-in users). Loading / failed: one line. Results are drawn by DiscoverPage.
 */
export function AiAsk({ ai, signedIn, onSignIn }: { ai: Ai; signedIn: boolean; onSignIn: () => void }) {
  const box = 'mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 text-xs sm:text-sm';
  const style = { borderColor: 'var(--border-subtle)', background: 'color-mix(in srgb, var(--accent) 5%, var(--bg-surface))' };
  const icon = <Sparkles className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--accent-text)' }} />;

  if (ai.status === 'loading') {
    return (
      <div className={box} style={style} role="status">
        <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" style={{ color: 'var(--accent-text)' }} />
        <span style={{ color: 'var(--text-secondary)' }}>Asking AI…</span>
      </div>
    );
  }

  if (ai.status === 'error') {
    return (
      <div className={box} style={style} role="alert">
        {icon}
        <span className="min-w-0 flex-1" style={{ color: 'var(--text-secondary)' }}>{ai.message}</span>
        {ai.retryable && <Button size="sm" variant="outline" onClick={ai.ask}>Try again</Button>}
      </div>
    );
  }

  if (ai.status === 'done') {
    return (
      <div className={box} style={style}>
        {icon}
        <span className="min-w-0 flex-1" style={{ color: 'var(--text-muted)' }}>
          {ai.quota && <>{ai.quota.remaining} of {ai.quota.limit} AI searches left today. </>}
          AI reads your request; the titles all come from TMDB.
        </span>
      </div>
    );
  }

  return (
    <div className={box} style={style}>
      {icon}
      <span className="min-w-0 flex-1" style={{ color: 'var(--text-secondary)' }}>
        <b style={{ color: 'var(--text-primary)' }}>Ask AI</b> in your own words, e.g. “scary Korean movies from the 2010s”.
        {ai.quota && <span style={{ color: 'var(--text-muted)' }}> {ai.quota.remaining} of {ai.quota.limit} left today.</span>}
      </span>
      {signedIn
        ? <Button size="sm" onClick={ai.ask}><Sparkles className="h-3.5 w-3.5" /> Ask AI</Button>
        : <Button size="sm" variant="outline" onClick={onSignIn}><LogIn className="h-3.5 w-3.5" /> Sign in to use</Button>}
    </div>
  );
}
