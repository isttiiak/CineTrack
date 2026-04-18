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
  'Torrent',
  'FTB',
  'Other',
] as const;

export const SECTION_COLORS: Record<string, string> = {
  'General': '#818cf8',
  'K-Drama & Asian': '#f9a8d4',
  'Crime & Gangster': '#f87171',
  'Racing': '#fdba74',
  'Christopher Nolan': '#67e8f9',
  'World Cinema': '#34d399',
  'TV Series': '#fbbf24',
  'Animation & Family': '#a78bfa',
};

export const SECTION_EMOJIS: Record<string, string> = {
  'General': '🎬',
  'K-Drama & Asian': '🌸',
  'Crime & Gangster': '🔫',
  'Racing': '🏎️',
  'Christopher Nolan': '🌀',
  'World Cinema': '🌍',
  'TV Series': '📺',
  'Animation & Family': '✨',
};
