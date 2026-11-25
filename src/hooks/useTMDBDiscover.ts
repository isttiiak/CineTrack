import { useState, useEffect, useRef, useCallback } from 'react';
import { tmdb, TMDB_IMG } from '../lib/tmdb';
import { getDetails, itemFromDetails, findByImdb, type TmdbKind } from '../lib/titleData';
import { parseTitleLink } from '../lib/links';
import { fetchComingSoonPage, feedRequest, normalizeFeedItems, canLoadMore, mergePage, pullNextPage, type Era, type PageResult as BasePage } from '../lib/discoverFeeds';
import { searchDiscover, searchDiscoverMore, type DiscoverGroup } from '../lib/discoverSearch';

export { TMDB_IMG };

export interface TMDBItem {
  id: number;
  title?: string;
  name?: string;
  media_type: 'movie' | 'tv';
  poster_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  genre_ids: number[];
  original_language: string;
  popularity?: number;
  vote_count?: number;
}

export interface TMDBDetails {
  country: string;
  imdbUrl: string;
  duration: string;
}

export type DiscoverTab = 'trending' | 'movies' | 'tv' | 'soon';

const COUNTRY_CODES: Record<string, string> = {
  US: 'USA', GB: 'UK', FR: 'France', DE: 'Germany', JP: 'Japan',
  KR: 'South Korea', IN: 'India', IT: 'Italy', ES: 'Spain', CN: 'China',
  AU: 'Australia', CA: 'Canada', BR: 'Brazil', MX: 'Mexico', SE: 'Sweden',
  DK: 'Denmark', NO: 'Norway', FI: 'Finland', NL: 'Netherlands', BE: 'Belgium',
  PL: 'Poland', RU: 'Russia', TR: 'Turkey', TH: 'Thailand', HK: 'Hong Kong',
  TW: 'Taiwan', AR: 'Argentina', CO: 'Colombia', PT: 'Portugal', AT: 'Austria',
};

/** Country, IMDb link and duration for a new entry. Shares the cached details request. */
export async function fetchTMDBDetails(id: number, mediaType: TmdbKind): Promise<TMDBDetails> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details = await getDetails(mediaType, id) as any;
    const extIds = details.external_ids ?? {};

    let country = '';
    if (mediaType === 'movie') {
      const code = details.production_countries?.[0]?.iso_3166_1 ?? '';
      country = COUNTRY_CODES[code] ?? details.production_countries?.[0]?.name ?? '';
    } else {
      const code = details.origin_country?.[0] ?? '';
      country = COUNTRY_CODES[code] ?? code;
    }

    const imdbUrl = extIds.imdb_id ? `https://www.imdb.com/title/${extIds.imdb_id}/` : '';

    let duration = '';
    if (mediaType === 'movie') {
      const rt = details.runtime ?? 0;
      if (rt > 0) {
        const h = Math.floor(rt / 60), m = rt % 60;
        duration = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
      }
    } else {
      // TMDB deprecated episode_run_time; fall back chain: runtime → episode_run_time[0] → latest episode.
      const rt = details.runtime ?? details.episode_run_time?.[0] ?? details.last_episode_to_air?.runtime ?? 0;
      // The episode count lets stats total a whole series instead of counting a single episode.
      const eps = details.number_of_episodes ?? 0;
      if (rt > 0) duration = eps > 0 ? `${rt} min/ep · ${eps} eps` : `${rt} min/ep`;
    }

    return { country, imdbUrl, duration };
  } catch {
    return { country: '', imdbUrl: '', duration: '' };
  }
}

/** A pasted/shared IMDb or TMDB link → that exact title (or null if it can't be found). */
export async function resolveLinkItem(text: string): Promise<TMDBItem | null> {
  const link = parseTitleLink(text);
  if (!link) return null;
  if (link.kind === 'tmdb') return itemFromDetails(await getDetails(link.type, link.id), link.type);
  const found = await findByImdb(link.id);
  return found ? itemFromDetails(await getDetails(found.kind, found.id), found.kind) : null;
}

type PageResult = BasePage<TMDBItem>;

/** Everything one Discover view needs to fetch its pages; created per (tab, era, search) and thrown away when they change. */
interface Pager {
  cancelled: boolean;
  busy: boolean;
  page: number;               // the next page to fetch
  more: boolean;
  controller: AbortController;
  fetchPage: (page: number, signal: AbortSignal) => Promise<PageResult>;
}

/**
 * The list behind every Discover tab, a page at a time. The first page replaces the list; `loadMore`
 * appends the next one without repeats (lib/discoverFeeds `mergePage`). Searching pages the plain title
 * matches too. Responses from a superseded tab, era or query are ignored.
 */
export function useTMDBDiscover(tab: DiscoverTab, searchQuery: string, era: Era = 'recent') {
  const [items, setItems] = useState<TMDBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [fromLink, setFromLink] = useState(false);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [correctedTo, setCorrectedTo] = useState<string | undefined>();
  const [groups, setGroups] = useState<DiscoverGroup[]>([]);
  const pagerRef = useRef<Pager | null>(null);
  const itemsRef = useRef<TMDBItem[]>([]);          // what is shown, readable inside loadMore without a stale closure
  const show = (list: TMDBItem[]) => { itemsRef.current = list; setItems(list); };

  useEffect(() => {
    const controller = new AbortController();
    const trimmed = searchQuery.trim();
    let pager: Pager | null = null;

    const reset = (extra: { reasons?: Record<number, string>; correctedTo?: string; groups?: DiscoverGroup[]; fromLink?: boolean } = {}) => {
      setReasons(extra.reasons ?? {}); setCorrectedTo(extra.correctedTo); setGroups(extra.groups ?? []); setFromLink(extra.fromLink ?? false);
    };
    const fail = (err: unknown) => { if ((err as Error)?.name !== 'AbortError' && pager && !pager.cancelled) { setLoading(false); setError(true); } };

    const start = (fetchFirst: (signal: AbortSignal) => Promise<PageResult & { after?: () => void }>, fetchLater: Pager['fetchPage']) => {
      pager = { cancelled: false, busy: false, page: 2, more: false, controller, fetchPage: fetchLater };
      pagerRef.current = pager;
      const mine = pager;
      fetchFirst(controller.signal)
        .then((r) => {
          if (mine.cancelled) return;
          r.after?.();
          show(mergePage([], r.items));
          mine.more = r.more; mine.page = r.nextPage ?? 2;
          setHasMore(r.more); setLoading(false);
        })
        .catch(fail);
    };

    const doFetch = () => {
      setLoading(true); setError(false); setLoadMoreError(false); setLoadingMore(false); setHasMore(false);

      // Pasting an IMDb/TMDB link finds that exact title.
      if (parseTitleLink(trimmed)) {
        pager = { cancelled: false, busy: false, page: 2, more: false, controller, fetchPage: async () => ({ items: [], more: false }) };
        pagerRef.current = pager;
        const mine = pager;
        resolveLinkItem(trimmed)
          .then((item) => { if (!mine.cancelled) { show(item ? [item] : []); reset({ fromLink: true }); setLoading(false); } })
          .catch(fail);
        return;
      }

      // Searching: relevance + popularity ranking, typo recovery, people, filters (lib/discoverSearch).
      if (trimmed.length > 1) {
        start(
          async (signal) => {
            const r = await searchDiscover(trimmed, signal);
            return { items: r.items, more: !!r.hasMore, after: () => reset({ reasons: r.reasons, correctedTo: r.correctedTo, groups: r.groups }) };
          },
          async (page, signal) => { const r = await searchDiscoverMore(trimmed, page, signal); return { items: r.items, more: r.hasMore }; },
        );
        return;
      }

      // Coming soon: the most anticipated unreleased films and series, a month per page, soonest first.
      if (tab === 'soon') {
        const soon = async (page: number, signal: AbortSignal): Promise<PageResult> => {
          const r = await fetchComingSoonPage(page, signal);
          return { items: r.items, more: r.nextPage !== null, nextPage: r.nextPage ?? undefined };
        };
        start(async (signal) => ({ ...(await soon(1, signal)), after: () => reset() }), soon);
        return;
      }

      // Trending / Movies / TV: lib/discoverFeeds `feedRequest`.
      const feed = async (page: number, signal: AbortSignal): Promise<PageResult> => {
        const req = feedRequest(tab, era, page);
        const data = await tmdb<{ results?: unknown; total_pages?: number }>(req.path, req.params, signal);
        return { items: normalizeFeedItems(data.results, tab), more: canLoadMore(page, data.total_pages ?? 1) };
      };
      start(async (signal) => ({ ...(await feed(1, signal)), after: () => reset() }), feed);
    };

    const timer = trimmed.length > 1 ? setTimeout(doFetch, 350) : null;
    if (!timer) doFetch();

    return () => {
      if (pager) pager.cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [tab, searchQuery, era]);

  /** Fetches the next page and appends it. Does nothing while a page is in flight or when there are no more. */
  const loadMore = useCallback(async () => {
    const pager = pagerRef.current;
    if (!pager || pager.cancelled || pager.busy || !pager.more) return;
    pager.busy = true;
    setLoadingMore(true); setLoadMoreError(false);
    try {
      const r = await pullNextPage(itemsRef.current, pager.page, (p) => pager.fetchPage(p, pager.controller.signal));
      if (pager.cancelled) return;
      pager.page = r.page;
      pager.more = r.more;
      if (r.items !== itemsRef.current) show(r.items);
      setHasMore(r.more);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError' && !pager.cancelled) setLoadMoreError(true);
    } finally {
      pager.busy = false;
      if (!pager.cancelled) setLoadingMore(false);
    }
  }, []);

  return { items, loading, loadingMore, error, loadMoreError, hasMore, loadMore, fromLink, reasons, correctedTo, groups };
}
