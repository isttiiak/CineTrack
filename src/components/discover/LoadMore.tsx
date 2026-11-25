import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  hasMore: boolean;
  loading: boolean;           // a page is on its way
  error: boolean;             // the last page failed
  count: number;              // titles shown (nothing is drawn for an empty list)
  onLoadMore: () => void;
  skeleton?: React.ReactNode; // placeholders while a page loads
  endText?: string;
}

/**
 * The end of a paged list. Scrolling near it loads the next page (an IntersectionObserver on an invisible
 * marker); the "Load more" button is the fallback for browsers without one, for keyboards and for anyone who
 * prefers to tap. When the list ends it says so. The observer is re-armed after every page, so a page
 * that doesn't push the marker out of view loads the next one by itself.
 */
export function LoadMore({ hasMore, loading, error, count, onLoadMore, skeleton, endText }: Props) {
  const marker = useRef<HTMLDivElement>(null);
  const callback = useRef(onLoadMore);
  callback.current = onLoadMore;
  const active = hasMore && !loading && !error;

  useEffect(() => {
    const el = marker.current;
    if (!active || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) callback.current(); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [active, count]);

  if (count === 0) return null;
  return (
    <div className="mt-6" data-testid="load-more">
      {loading && skeleton}
      <div ref={marker} aria-hidden className="h-px" />
      <div className="flex flex-col items-center gap-2 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }} aria-live="polite">
        {error ? (
          <>
            <span>Could not load more titles.</span>
            <button onClick={onLoadMore} className="rounded-lg px-4 py-2 text-xs font-semibold" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>Try again</button>
          </>
        ) : loading ? (
          <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more…</span>
        ) : hasMore ? (
          <button onClick={onLoadMore} className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>Load more</button>
        ) : (
          <span>{endText ?? "That's everything for now."}</span>
        )}
      </div>
    </div>
  );
}
