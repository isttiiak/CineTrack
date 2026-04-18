export type WatchStatus = 'plan' | 'watching' | 'watched';
export type MediaType = 'Film' | 'Series';
export type ThemeMode = 'dark' | 'light';

export type WatchPlatform =
  | 'Netflix'
  | 'Prime Video'
  | 'Apple TV+'
  | 'Disney+'
  | 'HBO Max'
  | 'YouTube'
  | 'Torrent'
  | 'FTB'
  | 'Other'
  | '';

export type Section =
  | 'General'
  | 'K-Drama & Asian'
  | 'Crime & Gangster'
  | 'Racing'
  | 'Christopher Nolan'
  | 'World Cinema'
  | 'TV Series'
  | 'Animation & Family'
  | string;

export interface MovieEntry {
  id: string;
  section: Section;
  type: MediaType;
  title: string;
  year: string;
  country: string;
  genre: string;
  imdbRating: string;
  imdbUrl: string;
  posterUrl?: string;
  isCustom: boolean;
}

export interface WatchMeta {
  id: string;
  status: WatchStatus;
  personalRating?: number;
  notes?: string;
  watchedOn?: string;
  watchPlatform?: WatchPlatform;
  watchLink?: string;
  duration?: string;
}

export interface WatchlistState {
  entries: MovieEntry[];
  meta: Record<string, WatchMeta>;
  sectionOrder: Section[];
  lastModified: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  avatar: string;
}

export interface FilterState {
  query: string;
  section: string;
  type: string;
  status: string;
  platform: string;
  sort: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}
