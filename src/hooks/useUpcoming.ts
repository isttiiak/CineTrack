import { useEffect, useMemo, useState } from 'react';
import type { MovieEntry, WatchMeta } from '../types';
import { getDetails, kindOf, resolveTmdbId } from '../lib/titleData';
import { todayKey } from '../lib/utils';

export type UpcomingKind = 'episode' | 'premiere' | 'release' | 'aired' | 'tba';

export interface UpcomingItem {
  entry: MovieEntry;
  kind: UpcomingKind;
  date: string | null;     // YYYY-MM-DD; null for "returning, date TBA"
  label: string;           // e.g. "S3 E1 · Episode name" or "Theatrical release"
}

const MAX_TITLES = 80;
const CONCURRENCY = 4;
const RECENT_DAYS = 14;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Items for one title (pure, so it can be tested without the network). */
export function upcomingFor(entry: MovieEntry, status: WatchMeta['status'] | undefined, d: {
  release_date?: string; status?: string;
  next_episode_to_air?: { air_date: string | null; season_number: number; episode_number: number; name?: string } | null;
  last_episode_to_air?: { air_date: string | null; season_number: number; episode_number: number; name?: string } | null;
}, today: string): UpcomingItem[] {
  const out: UpcomingItem[] = [];
  if (entry.type === 'Film') {
    if (d.release_date && d.release_date >= today) out.push({ entry, kind: 'release', date: d.release_date, label: 'Release' });
    return out;
  }
  const next = d.next_episode_to_air;
  if (next?.air_date && next.air_date >= today) {
    out.push({
      entry, date: next.air_date,
      kind: next.episode_number === 1 ? 'premiere' : 'episode',
      label: `${next.episode_number === 1 ? `Season ${next.season_number} premiere` : `S${next.season_number} E${next.episode_number}`}${next.name && !/^Episode \d+$/.test(next.name) ? ` · ${next.name}` : ''}`,
    });
  } else if (/returning/i.test(d.status ?? '')) {
    out.push({ entry, kind: 'tba', date: null, label: 'Returning — next date not announced' });
  }
  const last = d.last_episode_to_air;
  if (status !== 'plan' && last?.air_date && last.air_date <= today && daysBetween(last.air_date, today) <= RECENT_DAYS) {
    out.push({ entry, kind: 'aired', date: last.air_date, label: `S${last.season_number} E${last.episode_number} aired` });
  }
  return out;
}

/**
 * New episodes, season premieres and film releases for titles in the list. Looks up each series
 * (and each planned film that may not be out yet) on TMDB, a few at a time, cached for the session.
 */
export function useUpcoming(entries: MovieEntry[], meta: Record<string, WatchMeta>, enabled: boolean, onResolved: (entryId: string, tmdbId: number) => void) {
  const thisYear = new Date().getFullYear();
  const candidates = useMemo(() => entries.filter((e) => {
    if (e.type === 'Series') return true;
    const y = parseInt(e.year, 10);
    return (meta[e.id]?.status ?? 'plan') === 'plan' && (!Number.isFinite(y) || y >= thisYear - 1);
  }).slice(0, MAX_TITLES), [entries, meta, thisYear]);

  // Keyed on entry ids only: saving a looked-up TMDB id must not restart the whole scan.
  const key = candidates.map((e) => e.id).join('|');
  const [items, setItems] = useState<UpcomingItem[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const today = todayKey();
    const found: UpcomingItem[] = [];
    let index = 0, done = 0;
    setItems([]);
    setProgress({ done: 0, total: candidates.length });

    const worker = async () => {
      while (active && index < candidates.length) {
        const entry = candidates[index++];
        try {
          const id = await resolveTmdbId(entry);
          if (id && !entry.tmdbId && active) onResolved(entry.id, id);
          if (id) {
            const d = await getDetails(kindOf(entry.type), id);
            found.push(...upcomingFor(entry, meta[entry.id]?.status, d, today));
          }
        } catch { /* skip titles that fail; the rest still show */ }
        done++;
        if (active) { setProgress({ done, total: candidates.length }); setItems([...found]); }
      }
    };
    void Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  return { items, loading: progress.done < progress.total, progress };
}
