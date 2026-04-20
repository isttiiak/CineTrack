import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film, Tv, TrendingUp, Plus, Star, ExternalLink } from 'lucide-react';
import { useTMDBDiscover, TMDB_IMG, type TMDBItem, type DiscoverTab } from '@/hooks/useTMDBDiscover';
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
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};

const TABS: { id: DiscoverTab; label: string; icon: React.ReactNode }[] = [
  { id: 'trending', label: 'Trending', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: 'movies', label: 'Movies', icon: <Film className="h-3.5 w-3.5" /> },
  { id: 'tv', label: 'TV Shows', icon: <Tv className="h-3.5 w-3.5" /> },
];

export function DiscoverPage({ existingEntries, onAdd }: Props) {
  const [tab, setTab] = useState<DiscoverTab>('trending');
  const { items, loading, error } = useTMDBDiscover(tab);
  const [added, setAdded] = useState<Set<number>>(new Set());

  const existingTitles = new Set(existingEntries.map(e => e.title.toLowerCase()));

  function handleAdd(item: TMDBItem) {
    const title = item.title ?? item.name ?? '';
    const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4);
    const genreStr = item.genre_ids.map(id => TMDB_GENRES[id]).filter(Boolean).join(', ') || 'Unknown';
    const posterUrl = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : undefined;
    const type = item.media_type === 'movie' ? 'Film' : 'Series';
    const section = item.media_type === 'movie' ? 'General' : 'TV Series';

    onAdd(
      { title, year, country: '', genre: genreStr, imdbRating: item.vote_average.toFixed(1), imdbUrl: '', section, type, posterUrl },
      { status: 'plan' }
    );
    setAdded(prev => new Set([...prev, item.id]));
  }

  return (
    <div className="pb-20">
      {/* Tab bar */}
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

      {/* Error state */}
      {error && (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          Could not load discover data. Check your TMDB API key.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 20 }).map((_, i) => (
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

      {/* Grid */}
      {!loading && !error && (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
          >
            {items.map(item => {
              const title = item.title ?? item.name ?? '';
              const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4);
              const isAdded = added.has(item.id) || existingTitles.has(title.toLowerCase());
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

                    {/* Rating badge */}
                    {rating > 0 && (
                      <div className="absolute top-2 left-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold"
                           style={{ background: 'rgba(0,0,0,0.75)', color: rating >= 7 ? '#34d399' : rating >= 5.5 ? '#fbbf24' : '#f87171' }}>
                        <Star className="h-2.5 w-2.5 fill-current" />
                        {rating.toFixed(1)}
                      </div>
                    )}

                    {/* Type badge */}
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase"
                         style={{ background: 'rgba(0,0,0,0.7)', color: item.media_type === 'movie' ? 'var(--accent-cyan)' : 'var(--accent-pink)' }}>
                      {item.media_type === 'movie' ? 'Film' : 'Series'}
                    </div>

                    {/* Add overlay on hover */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                         style={{ background: 'rgba(0,0,0,0.55)' }}>
                      <button
                        onClick={() => !isAdded && handleAdd(item)}
                        disabled={isAdded}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: isAdded ? 'rgba(52,211,153,0.2)' : 'var(--accent-purple)',
                          color: isAdded ? '#34d399' : 'white',
                          border: isAdded ? '1px solid #34d399' : 'none',
                          cursor: isAdded ? 'default' : 'pointer',
                        }}
                      >
                        {isAdded ? '✓ In list' : <><Plus className="h-3.5 w-3.5" /> Add</>}
                      </button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-2.5 flex-1 flex flex-col gap-0.5">
                    <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                      {title}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {year || '—'}
                    </p>
                    {item.overview && (
                      <p className="text-[10px] line-clamp-2 mt-0.5 leading-relaxed" style={{ color: 'var(--text-disabled)' }}>
                        {item.overview}
                      </p>
                    )}
                  </div>

                  {/* TMDB link */}
                  <a
                    href={`https://www.themoviedb.org/${item.media_type}/${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-60 transition-opacity"
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
