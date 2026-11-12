import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film, Tv, TrendingUp, Sparkles } from 'lucide-react';
import { useTMDBDiscover, fetchTMDBDetails, TMDB_IMG, type TMDBItem, type DiscoverTab } from '@/hooks/useTMDBDiscover';
import { useRecommendations } from '@/hooks/useRecommendations';
import type { MovieEntry, WatchMeta } from '@/types';
import { findDuplicate } from '@/lib/duplicates';
import { getRatings, TMDB_GENRES } from '@/lib/titleData';
import { AddFromDiscoverDialog, type DiscoverAddChoice } from './AddFromDiscoverDialog';
import { DiscoverCard } from './DiscoverCard';

interface Props {
  existingEntries: MovieEntry[];
  meta: Record<string, WatchMeta>;
  sections: string[];
  search: string;            // the search box lives in the tab row (App)
  region: string;
  myServices: string[];
  openFirstResult: boolean;  // a shared link arrived: open the add dialog for it once loaded
  onOpenedFirstResult: () => void;
  onAdd: (entry: Omit<MovieEntry, 'id' | 'isCustom'>, meta: Partial<WatchMeta>) => void;
}

type Tab = DiscoverTab | 'foryou';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'trending', label: 'Trending', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: 'foryou',   label: 'For you',  icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'movies',   label: 'Movies',   icon: <Film className="h-3.5 w-3.5" /> },
  { id: 'tv',       label: 'TV Shows', icon: <Tv className="h-3.5 w-3.5" /> },
];

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

export function DiscoverPage({ existingEntries, meta, sections, search, region, myServices, openFirstResult, onOpenedFirstResult, onAdd }: Props) {
  const [tab, setTab] = useState<Tab>('trending');
  const listTab: DiscoverTab = tab === 'foryou' ? 'trending' : tab;
  const isSearching = search.trim().length > 1;
  const showForYou = tab === 'foryou' && !isSearching;
  const { items, loading, error, fromLink } = useTMDBDiscover(listTab, search);
  const { recs, loading: recsLoading, hasSeeds } = useRecommendations(existingEntries, meta, showForYou);
  const [pendingItem, setPendingItem] = useState<TMDBItem | null>(null);
  const [addState, setAddState] = useState<Record<number, 'loading' | 'done'>>({});

  const findExisting = (item: TMDBItem) => findDuplicate(existingEntries, {
    title: item.title ?? item.name ?? '',
    year: (item.release_date ?? item.first_air_date ?? '').slice(0, 4),
    type: item.media_type === 'movie' ? 'Film' : 'Series',
    imdbUrl: '',
    tmdbId: item.id,
  });

  /** Opens the confirm dialog (status, watch date, rating…) instead of adding straight away. */
  function requestAdd(item: TMDBItem) {
    if (addState[item.id] || findExisting(item)) return;
    setPendingItem(item);
  }

  // A link shared to the app (or pasted) resolves to one title: open its add dialog directly.
  useEffect(() => {
    if (!openFirstResult || loading) return;
    if (fromLink && items.length === 1 && !findExisting(items[0])) setPendingItem(items[0]);
    onOpenedFirstResult();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFirstResult, loading, fromLink, items]);

  async function handleAdd(item: TMDBItem, choice: DiscoverAddChoice) {
    setPendingItem(null);
    const title = item.title ?? item.name ?? '';
    if (addState[item.id] || findExisting(item)) return;

    setAddState(prev => ({ ...prev, [item.id]: 'loading' }));

    const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4);
    const genreStr = item.genre_ids.map(id => TMDB_GENRES[id]).filter(Boolean).join(', ') || '';
    const posterUrl = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : undefined;
    const type = item.media_type === 'movie' ? 'Film' : 'Series';

    // Country, IMDb link, runtime and real ratings, in parallel (both usually cached already).
    const [details, ratings] = await Promise.all([fetchTMDBDetails(item.id, item.media_type), getRatings(item.media_type, item.id)]);

    // The IMDb id from details is the strongest duplicate key; re-check now that we have it.
    if (findDuplicate(existingEntries, { title, year, type, imdbUrl: details.imdbUrl, tmdbId: item.id })) {
      setAddState(prev => ({ ...prev, [item.id]: 'done' }));
      return;
    }

    // Prefer the real IMDb score; fall back to TMDB's (labelled as TMDB).
    const useImdb = !!ratings?.imdb;
    onAdd(
      {
        title, year,
        country: details.country,
        genre: genreStr,
        imdbRating: useImdb ? ratings!.imdb!.toFixed(1) : item.vote_average > 0 ? item.vote_average.toFixed(1) : '',
        ratingSource: useImdb ? 'imdb' : 'tmdb',
        imdbUrl: details.imdbUrl,
        section: choice.section, type, posterUrl,
        tmdbId: item.id,
      },
      {
        status: choice.status,
        duration: details.duration,
        watchedOn: choice.watchedOn,
        personalRating: choice.personalRating,
        watchPlatform: choice.watchPlatform,
      }
    );

    setAddState(prev => ({ ...prev, [item.id]: 'done' }));
  }

  const card = (item: TMDBItem, reason?: string) => (
    <DiscoverCard
      key={item.id}
      item={item}
      inList={!!findExisting(item) || addState[item.id] === 'done'}
      adding={addState[item.id] === 'loading'}
      reason={reason}
      onAdd={() => requestAdd(item)}
    />
  );

  const skeleton = (n: number) => (
    <div className={GRID}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-xl" style={{ background: 'var(--bg-surface)' }}>
          <div className="aspect-[2/3]" style={{ background: 'var(--bg-elevated)' }} />
          <div className="space-y-2 p-2.5">
            <div className="h-3 rounded" style={{ background: 'var(--bg-elevated)', width: '80%' }} />
            <div className="h-2.5 rounded" style={{ background: 'var(--bg-elevated)', width: '50%' }} />
          </div>
        </div>
      ))}
    </div>
  );

  const muted = (text: React.ReactNode) => <div className="py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>{text}</div>;

  return (
    <div className="pb-20">
      <AddFromDiscoverDialog
        item={pendingItem} sections={sections} region={region} myServices={myServices}
        onCancel={() => setPendingItem(null)} onConfirm={handleAdd}
      />

      {!isSearching && (
        <div className="mb-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl p-1 [scrollbar-width:none]" style={{ background: 'var(--bg-elevated)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
              style={{
                background: tab === t.id ? 'var(--bg-surface)' : 'transparent',
                color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
              }}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      )}

      {isSearching && (
        <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          {fromLink ? 'Title from link' : <>Results for <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>"{search.trim()}"</span></>}
          {!fromLink && <span className="ml-2 opacity-70">· Tip: paste an IMDb or TMDB link to find an exact title</span>}
        </p>
      )}

      {showForYou ? (
        !hasSeeds ? muted(<>Rate a few titles 7+ (or mark them watched) and recommendations based on them will show up here.</>)
        : recsLoading ? skeleton(12)
        : recs.length === 0 ? muted('No recommendations yet — try rating more titles.')
        : <div className={GRID}>{recs.map((r) => card(r.item, `Because you liked ${r.because}`))}</div>
      ) : (
        <>
          {error && muted('Could not load titles. Check your connection, or set TMDB_API_KEY on the server.')}
          {loading && !error && skeleton(isSearching ? 10 : 20)}
          {!loading && !error && items.length === 0 && isSearching && muted(fromLink ? 'No title found for that link.' : `No results found for "${search.trim()}"`)}
          {!loading && !error && items.length > 0 && (
            <AnimatePresence mode="wait">
              <motion.div
                key={isSearching ? `search-${search}` : tab}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className={GRID}
              >
                {items.map((item) => card(item))}
              </motion.div>
            </AnimatePresence>
          )}
        </>
      )}
    </div>
  );
}
