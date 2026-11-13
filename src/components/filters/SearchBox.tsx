import { forwardRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
  mode: 'watchlist' | 'discover';
  matchCount?: number | null;     // watchlist: number of matches while searching
  className?: string;
}

const WATCHLIST_TIPS: { label: string; insert: string }[] = [
  { label: 'status:watched', insert: 'status:watched' },
  { label: 'is:series', insert: 'is:series' },
  { label: 'year:2020-2024', insert: 'year:2020-2024' },
  { label: 'rating>8', insert: 'rating>8' },
  { label: 'my>=8', insert: 'my>=8' },
  { label: 'genre:thriller', insert: 'genre:thriller' },
  { label: 'country:korea', insert: 'country:korea' },
  { label: 'platform:netflix', insert: 'platform:netflix' },
  { label: 'has:notes', insert: 'has:notes' },
  { label: 'is:unrated', insert: 'is:unrated' },
];

/**
 * The tab-row search box. On the watchlist it shows a cheat-sheet of filters while focused; on
 * Discover it searches TMDB (or resolves a pasted IMDb/TMDB link). Focus with "/" or ⌘K / Ctrl+K.
 */
export const SearchBox = forwardRef<HTMLInputElement, Props>(function SearchBox({ value, onChange, mode, matchCount, className }, ref) {
  const [focused, setFocused] = useState(false);
  // The cheat-sheet shows on an empty box only, so it never covers results.
  const showTips = focused && mode === 'watchlist' && !value.trim();

  const add = (token: string) => {
    const base = value.trim();
    onChange(base ? `${base} ${token} ` : `${token} `);
  };

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (value) onChange(''); else (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={mode === 'watchlist' ? 'Search your list…' : 'Search movies, shows, people or paste a link…'}
        aria-label={mode === 'watchlist' ? 'Search your watchlist' : 'Search movies and TV shows'}
        aria-describedby={showTips ? 'search-tips' : undefined}
        autoComplete="off"
        spellCheck={false}
        className="h-10 w-full rounded-xl border pl-9 pr-20 text-sm outline-none focus:ring-2 focus:ring-brand/40 [&::-webkit-search-cancel-button]:hidden"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
      />
      <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {value && matchCount != null && (
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{matchCount} found</span>
        )}
        {value ? (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange('')}
            className="rounded p-0.5 transition-colors hover:text-[var(--text-primary)]"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : !focused && (
          <kbd className="hidden rounded border px-1.5 font-mono text-[10px] sm:inline" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }} title="Press / to search">/</kbd>
        )}
      </div>

      {showTips && (
        <div
          id="search-tips"
          onMouseDown={(e) => e.preventDefault()}   // keep focus in the input while clicking a tip
          className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl border p-3 shadow-xl"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <p className="mb-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Typos, accents and word order don't matter. Combine words with filters:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WATCHLIST_TIPS.map((t) => (
              <button
                key={t.label}
                onClick={() => add(t.insert)}
                className="rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors hover:bg-[var(--bg-hover)]"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--accent)' }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px]" style={{ color: 'var(--text-disabled)' }}>
            Use quotes for an exact phrase · Esc clears · press / anywhere to search
          </p>
        </div>
      )}
    </div>
  );
});
