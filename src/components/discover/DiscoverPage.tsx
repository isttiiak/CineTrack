import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film, Tv, TrendingUp, Sparkles, CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import { useTMDBDiscover, fetchTMDBDetails, TMDB_IMG, type TMDBItem, type DiscoverTab } from '@/hooks/useTMDBDiscover';
import { useRecommendations } from '@/hooks/useRecommendations';
import type { MovieEntry, WatchMeta } from '@/types';
import { findDuplicate } from '@/lib/duplicates';
import { getRatings, TMDB_GENRES } from '@/lib/titleData';
import { AddFromDiscoverDialog, type DiscoverAddChoice } from './AddFromDiscoverDialog';
import { DiscoverCard } from './DiscoverCard';
import { releaseDate, releaseGroupLabel } from '@/lib/discoverFeeds';
import type { DiscoverGroup } from '@/lib/discoverSearch';

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
  onEdit: (entry: MovieEntry) => void;
  initialTab?: Tab;           // e.g. 'soon' when arriving from the Upcoming tab
}

type Tab = DiscoverTab | 'foryou';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'trending', label: 'Trending',    icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: 'foryou',   label: 'For you',     icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'soon',     label: 'Coming soon', icon: <CalendarClock className="h-3.5 w-3.5" /> },
  { id: 'movies',   label: 'Movies',      icon: <Film className="h-3.5 w-3.5" /> },
  { id: 'tv',       label: 'TV Shows',    icon: <Tv className="h-3.5 w-3.5" /> },
];

/** Coming soon, grouped under "This week", "December 2026"… (the list is already in date order). */
function groupByRelease(items: TMDBItem[]): [string, TMDBItem[]][] {
  const groups = new Map<string, TMDBItem[]>();
  for (const item of items) {
    const label = releaseGroupLabel(releaseDate(item));
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups.entries()];
}

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

export function DiscoverPage({ existingEntries, meta, sections, search, region, myServices, openFirstResult, onOpenedFirstResult, onAdd, onEdit, initialTab = 'trending' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const listTab: DiscoverTab = tab === 'foryou' ? 'trending' : tab;
  const isSearching = search.trim().length > 1;
  const showForYou = tab === 'foryou' && !isSearching;
  const { items, loading, error, fromLink, reasons, correctedTo, groups } = useTMDBDiscover(listTab, search);
  const { recs, loading: recsLoading, hasSeeds, seedTitles } = useRecommendations(existingEntries, meta, showForYou);
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

  const card = (item: TMDBItem, reason?: string) => {
    const existing = findExisting(item);
    return (
      <DiscoverCard
        key={item.id}
        item={item}
        inList={!!existing || addState[item.id] === 'done'}
        adding={addState[item.id] === 'loading'}
        reason={reason}
        listStatus={existing ? meta[existing.id]?.status ?? 'plan' : undefined}
        onAdd={() => requestAdd(item)}
        onEdit={existing ? () => onEdit(existing) : undefined}
      />
    );
  };

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

      {isSearching && !loading && !error && groups.map((g) => (
        <GroupSection key={g.id} group={g} renderCard={card} />
      ))}

      {isSearching && !loading && items.length > 0 && (
        <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          {fromLink ? 'Title from link'
            : correctedTo ? <>No exact match for “{search.trim()}”, showing results for <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>“{correctedTo}”</span></>
            : groups.length > 0 ? <span className="font-semibold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>Other matches</span>
            : <>Best matches first, then the most popular · <span className="opacity-70">tip: try a director, actor, studio or franchise (nolan, marvel, star wars), or year:2024, is:series, rating&gt;7</span></>}
        </p>
      )}

      {showForYou ? (
        !hasSeeds ? muted(<>Rate a few titles 7+ (or mark them watched) and recommendations based on them will show up here.</>)
        : recsLoading ? skeleton(12)
        : recs.length === 0 ? muted('No recommendations yet — try rating more titles.')
        : <>
            <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              Picked from what you rated highest and watched recently: <span style={{ color: 'var(--text-secondary)' }}>{seedTitles.slice(0, 5).join(', ')}{seedTitles.length > 5 ? '…' : ''}</span>.
              Titles you rated 4 or lower are ignored.
            </p>
            <div className={GRID}>{recs.map((r) => card(r.item, r.because))}</div>
          </>
      ) : (
        <>
          {error && muted('Could not load titles. Check your connection, or set TMDB_API_KEY on the server.')}
          {loading && !error && skeleton(isSearching ? 10 : 20)}
          {!loading && !error && items.length === 0 && groups.length === 0 && isSearching && (
            <NoResults
              text={fromLink ? 'No title found for that link.' : `Nothing found for “${search.trim()}”.`}
              entries={existingEntries} meta={meta} renderCard={card}
            />
          )}
          {!loading && !error && items.length > 0 && (
            <AnimatePresence mode="wait">
              <motion.div
                key={isSearching ? `search-${search}` : tab}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className={GRID}
              >
                {tab === 'soon' && !isSearching
                  ? groupByRelease(items).map(([label, list]) => (
                      <section key={label} className="col-span-full">
                        <h2 className="mb-2 mt-3 text-xs font-bold uppercase tracking-widest first:mt-0" style={{ color: 'var(--text-disabled)' }}>{label}</h2>
                        <div className={GRID}>{list.map((item) => card(item))}</div>
                      </section>
                    ))
                  : items.map((item) => card(item, reasons[item.id]))}
              </motion.div>
            </AnimatePresence>
          )}
          {!loading && !error && items.length > 0 && tab === 'soon' && !isSearching && (
            <p className="mt-6 text-xs" style={{ color: 'var(--text-disabled)' }}>
              The most anticipated releases of the next year. Dates are TMDB's earliest release date and can differ by country.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const GROUP_PREVIEW = 12;

/** A person's work, a studio's titles or a franchise: the first dozen, with "Show all" for the rest. */
function GroupSection({ group, renderCard }: { group: DiscoverGroup; renderCard: (item: TMDBItem) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  const more = group.items.length - GROUP_PREVIEW;
  const visible = all ? group.items : group.items.slice(0, GROUP_PREVIEW);
  return (
    <section className="mb-8" aria-label={group.title}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>{group.title}</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{group.subtitle}</p>
        </div>
        {more > 0 && (
          <button
            onClick={() => setAll((v) => !v)}
            aria-expanded={all}
            className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--accent-text)' }}
          >
            {all ? <>Show less <ChevronUp className="h-3.5 w-3.5" /></> : <>Show all {group.items.length} <ChevronDown className="h-3.5 w-3.5" /></>}
          </button>
        )}
      </div>
      <div className={GRID}>{visible.map((item) => renderCard(item))}</div>
    </section>
  );
}

/**
 * Empty Discover search: one line saying so, then something worth adding instead: personal
 * recommendations when the user has rated titles, otherwise what's trending this week.
 */
function NoResults({ text, entries, meta, renderCard }: {
  text: string;
  entries: MovieEntry[];
  meta: Record<string, WatchMeta>;
  renderCard: (item: TMDBItem, reason?: string) => React.ReactNode;
}) {
  const { recs, hasSeeds } = useRecommendations(entries, meta, true);
  const { items: trending } = useTMDBDiscover('trending', '');
  const listed = new Set(entries.map((e) => e.tmdbId).filter(Boolean));
  const picks = (hasSeeds && recs.length ? recs.map((r) => ({ item: r.item, reason: r.because })) : trending.map((item) => ({ item, reason: undefined as string | undefined })))
    .filter(({ item }) => !listed.has(item.id))
    .slice(0, 12);
  return (
    <div className="pt-2">
      <p className="mb-5 text-sm" style={{ color: 'var(--text-secondary)' }}>{text} Check the spelling, or try a shorter title.</p>
      {picks.length > 0 && (
        <>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>
            {hasSeeds && recs.length ? 'You might like' : 'Popular this week'}
          </h2>
          <div className={GRID}>{picks.map(({ item, reason }) => renderCard(item, reason))}</div>
        </>
      )}
    </div>
  );
}
