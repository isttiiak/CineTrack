import type { MovieEntry, WatchMeta, WatchlistState, WatchStatus, WatchPlatform, MediaType } from '../types';
import { LEGACY_PLATFORMS, PLATFORMS, SECTIONS } from './utils';
import { isValidWatchDate } from './watchDate';

/**
 * States produced by normalizeState that had old-format data converted (e.g. platform "Torrent" →
 * "Other"). Callers use it to write the converted data back, so the migration is persisted instead
 * of being redone on every read.
 */
export const migratedStates = new WeakSet<WatchlistState>();

const STATUSES: WatchStatus[] = ['plan', 'watching', 'watched'];
const MAX_ENTRIES = 2000;   // keeps the single Firestore doc well under its 1 MB cap
const MAX_TEXT = 300;
const MAX_NOTES = 500;

/** Only http(s) URLs are allowed into hrefs/srcs — blocks `javascript:` and `data:` payloads. */
export function safeUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** Firestore rejects `undefined` anywhere in a document; state is plain JSON so a round-trip drops them. */
export function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function str(value: unknown, max = MAX_TEXT): string {
  if (typeof value === 'number') return String(value).slice(0, max);
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function clampRating(value: unknown): number | undefined {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return Math.min(10, Math.max(1, Math.round(n * 10) / 10));
}

function normalizeEntry(raw: unknown): MovieEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title);
  const id = str(r.id, 100);
  if (!title || !id) return null;
  const entry: MovieEntry = {
    id,
    title,
    section: str(r.section, 60) || 'General',
    type: (r.type === 'Series' ? 'Series' : 'Film') as MediaType,
    year: str(r.year, 12),
    country: str(r.country, 100),
    genre: str(r.genre, 200),
    imdbRating: str(r.imdbRating, 8),
    imdbUrl: safeUrl(r.imdbUrl),
    isCustom: r.isCustom !== false,
  };
  const posterUrl = safeUrl(r.posterUrl);
  if (posterUrl) entry.posterUrl = posterUrl;
  if (typeof r.tmdbId === 'number' && Number.isFinite(r.tmdbId)) entry.tmdbId = r.tmdbId;
  if (r.ratingSource === 'imdb' || r.ratingSource === 'tmdb') entry.ratingSource = r.ratingSource;
  return entry;
}

function normalizeMeta(id: string, raw: unknown, onMigrate: () => void): WatchMeta {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const meta: WatchMeta = {
    id,
    status: STATUSES.includes(r.status as WatchStatus) ? (r.status as WatchStatus) : 'plan',
  };
  const rating = clampRating(r.personalRating);
  if (rating !== undefined) meta.personalRating = rating;
  const notes = str(r.notes, MAX_NOTES);
  if (notes) meta.notes = notes;
  if (isValidWatchDate(r.watchedOn)) meta.watchedOn = r.watchedOn;   // YYYY, YYYY-MM or YYYY-MM-DD
  if ((PLATFORMS as readonly string[]).includes(r.watchPlatform as string)) {
    meta.watchPlatform = r.watchPlatform as WatchPlatform;
  } else if (typeof r.watchPlatform === 'string' && LEGACY_PLATFORMS[r.watchPlatform.trim().toLowerCase()]) {
    meta.watchPlatform = LEGACY_PLATFORMS[r.watchPlatform.trim().toLowerCase()] as WatchPlatform;
    onMigrate();
  }
  const watchLink = safeUrl(r.watchLink);
  if (watchLink) meta.watchLink = watchLink;
  const duration = str(r.duration, 30);
  if (duration) meta.duration = duration;
  const season = Number(r.progressSeason), episode = Number(r.progressEpisode);
  if (Number.isInteger(season) && Number.isInteger(episode) && season >= 0 && season <= 500 && episode >= 1 && episode <= 5000) {
    meta.progressSeason = season;
    meta.progressEpisode = episode;
  }
  return meta;
}

/**
 * Coerces untrusted data (import files, localStorage, Firestore) into a consistent WatchlistState:
 * unique ids, a meta record for every entry and none for missing ones, every used section present
 * in sectionOrder, and only safe URLs. Returns null when the input isn't recognisable at all.
 */
export function normalizeState(raw: unknown): WatchlistState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.entries)) return null;

  const rawMeta = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Record<string, unknown>;
  let migrated = false;
  const seen = new Set<string>();
  const entries: MovieEntry[] = [];
  const meta: Record<string, WatchMeta> = {};
  for (const item of r.entries.slice(0, MAX_ENTRIES)) {
    const entry = normalizeEntry(item);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
    meta[entry.id] = normalizeMeta(entry.id, rawMeta[entry.id], () => { migrated = true; });
  }

  const order = Array.isArray(r.sectionOrder)
    ? r.sectionOrder.map((s) => str(s, 60)).filter(Boolean)
    : [];
  const sectionOrder = withAllSections([...new Set(order.length ? order : SECTIONS)], entries);

  const lastModified = typeof r.lastModified === 'string' && !isNaN(Date.parse(r.lastModified))
    ? r.lastModified
    : new Date(0).toISOString();

  const state: WatchlistState = { entries, meta, sectionOrder, lastModified };
  if (migrated) migratedStates.add(state);
  return state;
}

/** Appends any section used by an entry but missing from the order (otherwise those entries are invisible). */
export function withAllSections(order: string[], entries: MovieEntry[]): string[] {
  const out = [...order];
  for (const e of entries) if (!out.includes(e.section)) out.push(e.section);
  return out;
}

export { MAX_ENTRIES };
