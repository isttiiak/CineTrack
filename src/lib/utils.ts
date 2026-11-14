import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Local calendar date as YYYY-MM-DD (not UTC, so late-evening watches land on the right day). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const todayKey = () => localDateKey(new Date());

/**
 * Total runtime in minutes from a duration label: "2h 28m", "95m", "45 min/ep · 24 eps".
 * A per-episode length without an episode count can't be totalled, so it returns null
 * (callers must not count it as one episode). Returns 0 for empty or unparseable labels.
 */
export function parseMins(d?: string): number | null {
  if (!d) return 0;
  const perEp = d.match(/(\d+)\s*min\s*\/\s*ep\b/i);
  if (perEp) {
    const eps = d.match(/(\d+)\s*eps?\b/i);
    return eps ? parseInt(perEp[1]) * parseInt(eps[1]) : null;
  }
  let t = 0;
  const h = d.match(/(\d+)\s*h/i);           if (h) t += parseInt(h[1]) * 60;
  const m = d.match(/(\d+)\s*m(?:in)?\b/i);  if (m) t += parseInt(m[1]);
  return t;
}

/**
 * Where an entry's star rating came from. Entries added from Discover before the field existed
 * hold TMDB scores; starter-list (seed) titles always had IMDb scores, even after the app looked
 * up their TMDB id.
 */
export function ratingSourceOf(entry: { ratingSource?: 'imdb' | 'tmdb'; tmdbId?: number; isCustom?: boolean }): 'imdb' | 'tmdb' {
  return entry.ratingSource ?? (entry.tmdbId && entry.isCustom !== false ? 'tmdb' : 'imdb');
}

export function getImdbColor(rating: string): string {
  const n = parseFloat(rating);
  if (isNaN(n)) return 'text-gray-500';
  if (n >= 7.5) return 'text-emerald-400';
  if (n >= 6.0) return 'text-yellow-400';
  return 'text-red-400';
}

export const SECTIONS = [
  'General',
  'K-Drama & Asian',
  'Crime & Gangster',
  'Racing',
  'Christopher Nolan',
  'Marvel',
  'World Cinema',
  'TV Series',
  'Animation & Family',
] as const;

export const PLATFORMS = [
  'Netflix',
  'Prime Video',
  'Apple TV+',
  'Disney+',
  'HBO Max',
  'YouTube',
  'Other',
] as const;

/** Platform names from older versions → their replacement. Applied whenever data is read (schema.ts). */
export const LEGACY_PLATFORMS: Record<string, (typeof PLATFORMS)[number]> = {
  torrent: 'Other',
  ftb: 'Other',
};

export const GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'History', 'Horror', 'Music',
  'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western',
] as const;

export const SECTION_COLORS: Record<string, string> = {
  'General': '#7dd3fc',
  'K-Drama & Asian': '#f9a8d4',
  'Crime & Gangster': '#f87171',
  'Racing': '#fdba74',
  'Christopher Nolan': '#67e8f9',
  'Marvel': '#a78bfa',
  'World Cinema': '#34d399',
  'TV Series': '#fbbf24',
  'Animation & Family': '#bef264',
};

export const SECTION_EMOJIS: Record<string, string> = {
  'General': '🎬',
  'K-Drama & Asian': '🌸',
  'Crime & Gangster': '🔫',
  'Racing': '🏎️',
  'Christopher Nolan': '🌀',
  'Marvel': '🦸',
  'World Cinema': '🌍',
  'TV Series': '📺',
  'Animation & Family': '✨',
};
