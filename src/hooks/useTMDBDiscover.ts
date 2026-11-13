import { useState, useEffect } from 'react';
import { tmdb, TMDB_IMG } from '../lib/tmdb';
import { getDetails, itemFromDetails, findByImdb, type TmdbKind } from '../lib/titleData';
import { parseTitleLink } from '../lib/links';
import { searchDiscover } from '../lib/discoverSearch';

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

export type DiscoverTab = 'trending' | 'movies' | 'tv';

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

export function useTMDBDiscover(tab: DiscoverTab, searchQuery: string) {
  const [items, setItems] = useState<TMDBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fromLink, setFromLink] = useState(false);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [correctedTo, setCorrectedTo] = useState<string | undefined>();

  useEffect(() => {
    // Ignore responses from superseded queries so a slow older search can't overwrite newer results.
    const controller = new AbortController();
    let cancelled = false;
    const trimmed = searchQuery.trim();

    const doFetch = () => {
      setLoading(true);
      setError(false);

      // Pasting an IMDb/TMDB link finds that exact title.
      if (parseTitleLink(trimmed)) {
        resolveLinkItem(trimmed)
          .then((item) => { if (!cancelled) { setItems(item ? [item] : []); setFromLink(true); setLoading(false); } })
          .catch(() => { if (!cancelled) { setLoading(false); setError(true); } });
        return;
      }

      // Searching: relevance + popularity ranking, typo recovery, people, filters (lib/discoverSearch).
      if (trimmed.length > 1) {
        searchDiscover(trimmed, controller.signal)
          .then((r) => {
            if (cancelled) return;
            setItems(r.items); setReasons(r.reasons); setCorrectedTo(r.correctedTo);
            setFromLink(false); setLoading(false);
          })
          .catch((err) => { if (err?.name !== 'AbortError' && !cancelled) { setLoading(false); setError(true); } });
        return;
      }

      const path = ({ trending: 'trending/all/week', movies: 'movie/popular', tv: 'tv/popular' } as Record<DiscoverTab, string>)[tab];
      const params: Record<string, string> = { language: 'en-US' };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tmdb<any>(path, params, controller.signal)
        .then(data => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results: TMDBItem[] = (data.results || [] as any[])
            .filter((item: { media_type?: string; title?: string; name?: string }) =>
              item.media_type !== 'person' && (item.title || item.name)
            )
            .map((item: { media_type?: string }) => ({
              ...item,
              media_type: (item.media_type === 'movie' || item.media_type === 'tv')
                ? item.media_type
                : (tab === 'movies' ? 'movie' : 'tv'),
            })) as TMDBItem[];
          setItems(results);
          setReasons({}); setCorrectedTo(undefined);
          setFromLink(false);
          setLoading(false);
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return;
          setLoading(false); setError(true);
        });
    };

    const timer = trimmed.length > 1 ? setTimeout(doFetch, 350) : null;
    if (!timer) doFetch();

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [tab, searchQuery]);

  return { items, loading, error, fromLink, reasons, correctedTo };
}
