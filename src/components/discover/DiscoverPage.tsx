import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film, Tv, TrendingUp, Plus, Star, ExternalLink, Search, X, Loader2 } from 'lucide-react';
import { useTMDBDiscover, fetchTMDBDetails, TMDB_IMG, type TMDBItem, type DiscoverTab } from '@/hooks/useTMDBDiscover';
import type { MovieEntry, WatchMeta } from '@/types';

interface Props {
  existingEntries: MovieEntry[];
  onAdd: (entry: Omit<MovieEntry, 'id' | 'isCustom'>, meta: Partial<WatchMeta>) => void;
}

const TMDB_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10765: 'Sci-Fi & Fantasy',
  10768: 'War & Politics',
};

const TABS: { id: DiscoverTab; label: string; icon: React.ReactNode }[] = [
  { id: 'trending', label: 'Trending', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: 'movies',   label: 'Movies',   icon: <Film className="h-3.5 w-3.5" /> },
  { id: 'tv',       label: 'TV Shows', icon: <Tv className="h-3.5 w-3.5" /> },
];

export function DiscoverPage({ existingEntries, onAdd }: Props) {
  const [tab, setTab] = useState<DiscoverTab>('trending');
  const [search, setSearch] = useState('');
  const { items, loading, error } = useTMDBDiscover(tab, search);

  // Track per-item adding state: 'idle' | 'loading' | 'done'
  const [addState, setAddState] = useState<Record<number, 'loading' | 'done'>>({});

  const existingTitles = new Set(existingEntries.map(e => e.title.toLowerCase()));

  async function handleAdd(item: TMDBItem) {
    const title = item.title ?? item.name ?? '';
    if (addState[item.id] || existingTitles.has(title.toLowerCase())) return;

    setAddState(prev => ({ ...prev, [item.id]: 'loading' }));

    const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4);
    const genreStr = item.genre_ids.map(id => TMDB_GENRES[id]).filter(Boolean).join(', ') || '';
    const posterUrl = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : undefined;
    const type = item.media_type === 'movie' ? 'Film' : 'Series';
    const section = item.media_type === 'movie' ? 'General' : 'TV Series';
    const imdbRating = item.vote_average > 0 ? item.vote_average.toFixed(1) : '';

    // Fetch extra details (country, IMDb URL, duration) in parallel
    const details = await fetchTMDBDetails(item.id, item.media_type);

    onAdd(
      {
        title, year,
        country: details.country,
        genre: genreStr,
        imdbRating,
        imdbUrl: details.imdbUrl,
        section, type, posterUrl,
      },
      { status: 'plan', duration: details.duration }
    );

    setAddState(prev => ({ ...prev, [item.id]: 'done' }));
  }

  const isSearching = search.trim().length > 1;

  return (
    <div className="pb-20">
      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search any movie or TV show…"
          className="w-full h-10 pl-9 pr-9 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tab bar — hidden while searching */}
      {!isSearching && (
        <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-elevated)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: tab === t.id ? 'var(--bg-surface)' : 'transparent',
                color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      )}

      {isSearching && (
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Results for <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>"{search.trim()}"</span>
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          Could not load data. Check your TMDB API key.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: isSearching ? 10 : 20 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden animate-pulse" style={{ background: 'var(--bg-surface)' }}>
              <div className="aspect-[2/3]" style={{ background: 'var(--bg-elevated)' }} />
              <div className="p-2.5 space-y-2">
                <div className="h-3 rounded" style={{ background: 'var(--bg-elevated)', width: '80%' }} />
                <div className="h-2.5 rounded" style={{ background: 'var(--bg-elevated)', width: '50%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty search result */}
      {!loading && !error && items.length === 0 && isSearching && (
        <div className="py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          No results found for "{search.trim()}"
        </div>
      )}

      {/* Grid */}
      {!loading && !error && items.length > 0 && (
        <AnimatePresence mode="wait">
          <motion.div
            key={isSearching ? `search-${search}` : tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
          >
            {items.map(item => {
              const title = item.title ?? item.name ?? '';
              const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4);
              const inList = existingTitles.has(title.toLowerCase()) || addState[item.id] === 'done';
              const isAdding = addState[item.id] === 'loading';
              const rating = item.vote_average;

              return (
                <motion.div
                  key={item.id}
                  layout
                  className="group relative rounded-xl overflow-hidden border flex flex-col"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                >
                  {/* Poster */}
                  <div className="relative aspect-[2/3] overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                    {item.poster_path ? (
                      <img
                        src={`${TMDB_IMG}${item.poster_path}`}
                        alt={title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="h-10 w-10 opacity-20" style={{ color: 'var(--text-muted)' }} />
                      </div>
                    )}

                    {/* Rating */}
                    {rating > 0 && (
                      <div
                        className="absolute top-2 left-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold"
                        style={{ background: 'rgba(0,0,0,0.75)', color: rating >= 7 ? '#34d399' : rating >= 5.5 ? '#fbbf24' : '#f87171' }}
                      >
                        <Star className="h-2.5 w-2.5 fill-current" />
                        {rating.toFixed(1)}
                      </div>
                    )}

                    {/* Type badge */}
                    <div
                      className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase"
                      style={{ background: 'rgba(0,0,0,0.7)', color: item.media_type === 'movie' ? 'var(--accent-cyan)' : 'var(--accent-pink)' }}
                    >
                      {item.media_type === 'movie' ? 'Film' : 'Series'}
                    </div>

                    {/* Add overlay — visible on hover (desktop) and always on mobile */}
                    <div
                      className="absolute inset-0 flex items-end justify-center pb-3 opacity-0 group-hover:opacity-100 sm:opacity-0 transition-opacity"
                      style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }}
                    >
                      <button
                        onClick={() => handleAdd(item)}
                        disabled={inList || isAdding}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all min-h-[36px]"
                        style={{
                          background: inList ? 'rgba(52,211,153,0.2)' : 'var(--accent-purple)',
                          color: inList ? '#34d399' : 'white',
                          border: inList ? '1px solid #34d399' : 'none',
                          cursor: inList ? 'default' : 'pointer',
                          opacity: isAdding ? 0.7 : 1,
                        }}
                      >
                        {isAdding
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding…</>
                          : inList
                          ? '✓ In list'
                          : <><Plus className="h-3.5 w-3.5" /> Add</>
                        }
                      </button>
                    </div>
                  </div>

                  {/* Info + mobile add button */}
                  <div className="p-2.5 flex-1 flex flex-col gap-0.5">
                    <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                      {title}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{year || '—'}</p>
                    {item.overview && (
                      <p className="hidden sm:block text-[10px] line-clamp-2 mt-0.5 leading-relaxed" style={{ color: 'var(--text-disabled)' }}>
                        {item.overview}
                      </p>
                    )}

                    {/* Mobile add button (always visible, no hover needed) */}
                    <button
                      onClick={() => handleAdd(item)}
                      disabled={inList || isAdding}
                      className="sm:hidden mt-1.5 flex items-center justify-center gap-1 w-full py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style={{
                        background: inList ? 'color-mix(in srgb, var(--accent-green) 15%, transparent)' : 'color-mix(in srgb, var(--accent-purple) 20%, transparent)',
                        color: inList ? 'var(--accent-green)' : 'var(--accent-purple)',
                        border: `1px solid ${inList ? 'color-mix(in srgb, var(--accent-green) 40%, transparent)' : 'color-mix(in srgb, var(--accent-purple) 40%, transparent)'}`,
                      }}
                    >
                      {isAdding
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Adding…</>
                        : inList ? '✓ In list'
                        : <><Plus className="h-3 w-3" /> Add</>
                      }
                    </button>
                  </div>

                  {/* TMDB external link */}
                  <a
                    href={`https://www.themoviedb.org/${item.media_type}/${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-2 right-2 hidden sm:block opacity-0 group-hover:opacity-50 transition-opacity"
                    title="View on TMDB"
                  >
                    <ExternalLink className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                  </a>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
