# 🎬 CineTrack — Personal Watchlist Tracker
## CLAUDE.md — Full Project Context & Build Guide

---

## 1. PROJECT IDEA & GOAL

CineTrack is a **personal watchlist web app** where anyone can track movies and TV series they want to watch, are currently watching, or have already watched.

### Core Philosophy
- **Zero friction** — works as guest instantly, sign in for cloud sync
- **Data safety** — Firestore auto-sync so data is never lost, ever
- **Personal** — every user manages their own independent list, private by default
- **Public deployment** — one live link, used by infinite users independently
- **Developer visibility** — Firebase Analytics shows you real user counts and behavior
- **No custom backend** — Firebase IS the backend, fully managed, free tier generous

### Who Uses It
Anyone visits the live URL → works as guest (localStorage) OR signs in with Google → gets default seed catalog → manages their own watchlist → data saved in their own Firestore document. No data is ever shared between users.

---

## 2. TECH STACK

| Layer | Tool | Why |
|---|---|---|
| **Language** | TypeScript (TSX) | Type safety, better DX, shadcn/ui native |
| **Framework** | React 18 | Component model, hooks, ecosystem |
| **Build Tool** | Vite | Instant HMR, fast builds, simple config |
| **Styling** | Tailwind CSS v3 | Dark mode, utility classes, no CSS bloat |
| **Components** | shadcn/ui | Pre-built accessible components |
| **Animations** | Framer Motion | Page transitions, list animations, gestures |
| **Icons** | Lucide React | Clean, consistent icon set |
| **Auth** | Firebase Auth (Google provider) | Persistent login, no custom backend |
| **Database** | Firestore | Per-user data, real-time, free generous tier |
| **Analytics** | Firebase Analytics | DAU, MAU, events, retention — all free |
| **Posters** | TMDB API (free) | Auto-fetch movie posters by title |
| **Hosting** | Vercel | Free, auto-deploy from GitHub |
| **Repo** | GitHub (public) | Version control + Vercel integration |

### Firebase Free Tier Limits (very generous)
- Firestore: 50,000 reads/day, 20,000 writes/day, 1GB storage
- Auth: Unlimited users free
- Analytics: Unlimited free
- Enough for thousands of daily active users before hitting limits

---

## 3. PROJECT STRUCTURE

```
cinetrack/
├── public/
│   ├── favicon.ico
│   ├── icon-192.png
│   ├── icon-512.png
│   └── manifest.json              # PWA manifest
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx          # App title, stats, progress bar, user chip
│   │   │   ├── UserProfile.tsx     # Google avatar, name, sign out dropdown
│   │   │   └── CursorGlow.tsx      # Animated mouse spotlight effect
│   │   ├── watchlist/
│   │   │   ├── WatchlistSection.tsx  # Section group (e.g. "K-Drama")
│   │   │   ├── MovieRow.tsx          # Single movie/series row
│   │   │   ├── StatusBadge.tsx       # Clickable plan/watching/watched badge
│   │   │   ├── RatingBadge.tsx       # Personal X/10 rating input
│   │   │   ├── PosterThumb.tsx       # TMDB poster thumbnail
│   │   │   └── AddModal.tsx          # Dialog to add / edit entry
│   │   ├── filters/
│   │   │   └── FilterBar.tsx         # Search + filter dropdowns
│   │   ├── auth/
│   │   │   └── AuthBanner.tsx        # "Sign in to sync" banner for guests
│   │   └── ui/                       # shadcn/ui components (auto-generated)
│   ├── hooks/
│   │   ├── useWatchlist.ts           # All list CRUD logic
│   │   ├── useFirestore.ts           # Firestore read/write/sync
│   │   ├── useAuth.ts                # Firebase Auth state
│   │   ├── useLocalStorage.ts        # Guest mode localStorage helpers
│   │   ├── useTMDB.ts                # Fetch poster by title
│   │   ├── useCursorGlow.ts          # Mouse position tracking for glow
│   │   └── useToast.ts               # Toast notification state
│   ├── data/
│   │   └── seedMovies.ts             # Small default seed catalog (7 entries)
│   ├── types/
│   │   └── index.ts                  # All TypeScript interfaces
│   ├── lib/
│   │   ├── firebase.ts               # Firebase app init
│   │   ├── firestore.ts              # Firestore helpers
│   │   └── utils.ts                  # cn() helper, misc utilities
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css                     # Tailwind directives + custom CSS vars
├── index.html
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
├── .env.example
├── CLAUDE.md                         # This file
└── README.md
```

---

## 4. TYPESCRIPT INTERFACES

```typescript
// src/types/index.ts

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
  | string; // allow custom sections

export interface MovieEntry {
  id: string;                   // uuid for user entries; 'seed_0' etc for defaults
  section: Section;
  type: MediaType;
  title: string;
  year: string;
  country: string;
  genre: string;
  imdbRating: string;           // '7.5' or 'N/A'
  imdbUrl: string;
  posterUrl?: string;           // fetched from TMDB, cached
  isCustom: boolean;            // false = from seed, true = user-added
}

export interface WatchMeta {
  id: string;                   // matches MovieEntry.id
  status: WatchStatus;
  personalRating?: number;      // 1-10, user's own rating e.g. 8 shown as "8/10"
  notes?: string;               // free text review/notes
  watchedOn?: string;           // ISO date string 'YYYY-MM-DD'
  watchPlatform?: WatchPlatform;
  watchLink?: string;           // private URL (streaming, torrent, ftb — personal only)
}

export interface WatchlistState {
  entries: MovieEntry[];        // all entries (seed + custom)
  meta: Record<string, WatchMeta>;  // keyed by entry id
  sectionOrder: Section[];      // user's custom section ordering
  lastModified: string;         // ISO timestamp
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  avatar: string;               // photoURL from Google
}

export interface FilterState {
  query: string;
  section: string;
  type: string;
  status: string;
  platform: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}
```

---

## 5. SEED DATA (USE THIS — NOT THE OLD HARDCODED LIST)

This is the default catalog shown to every new user. Small, recent, diverse.
When a user signs in for the first time, this seed is written to their Firestore document as their starting list. They can delete, edit, or add to it freely.

**Do seed movies go into Firestore?**
Yes — on first sign-in, app checks if the user has a Firestore document. If not, it writes the seed as their initial list. After that, Firestore is their source of truth. The seed file is only used once per new user.

```typescript
// src/data/seedMovies.ts

import { MovieEntry } from '../types';

export const seedMovies: MovieEntry[] = [
  {
    id: 'seed_0',
    section: 'General',
    type: 'Film',
    title: 'Oppenheimer',
    year: '2023',
    country: 'USA',
    genre: 'Biography, Drama, History',
    imdbRating: '8.3',
    imdbUrl: 'https://www.imdb.com/title/tt15398776/',
    isCustom: false,
  },
  {
    id: 'seed_1',
    section: 'General',
    type: 'Film',
    title: 'Dune: Part Two',
    year: '2024',
    country: 'USA',
    genre: 'Action, Adventure, Sci-Fi',
    imdbRating: '8.5',
    imdbUrl: 'https://www.imdb.com/title/tt15239678/',
    isCustom: false,
  },
  {
    id: 'seed_2',
    section: 'TV Series',
    type: 'Series',
    title: 'Shogun',
    year: '2024',
    country: 'USA/Japan',
    genre: 'Action, Drama, History',
    imdbRating: '8.9',
    imdbUrl: 'https://www.imdb.com/title/tt2788316/',
    isCustom: false,
  },
  {
    id: 'seed_3',
    section: 'K-Drama & Asian',
    type: 'Series',
    title: 'Squid Game Season 2',
    year: '2024',
    country: 'South Korea',
    genre: 'Action, Drama, Thriller',
    imdbRating: '7.5',
    imdbUrl: 'https://www.imdb.com/title/tt21209876/',
    isCustom: false,
  },
  {
    id: 'seed_4',
    section: 'Animation & Family',
    type: 'Film',
    title: 'The Wild Robot',
    year: '2024',
    country: 'USA',
    genre: 'Animation, Adventure, Drama',
    imdbRating: '8.3',
    imdbUrl: 'https://www.imdb.com/title/tt29623480/',
    isCustom: false,
  },
  {
    id: 'seed_5',
    section: 'Crime & Gangster',
    type: 'Series',
    title: 'The Penguin',
    year: '2024',
    country: 'USA',
    genre: 'Action, Crime, Drama',
    imdbRating: '8.5',
    imdbUrl: 'https://www.imdb.com/title/tt14668630/',
    isCustom: false,
  },
  {
    id: 'seed_6',
    section: 'World Cinema',
    type: 'Film',
    title: 'All We Imagine as Light',
    year: '2024',
    country: 'India/France',
    genre: 'Drama, Romance',
    imdbRating: '7.8',
    imdbUrl: 'https://www.imdb.com/title/tt23227942/',
    isCustom: false,
  },
];

export const defaultMeta: Record<string, { status: 'plan' }> = Object.fromEntries(
  seedMovies.map(m => [m.id, { status: 'plan' as const }])
);
```

---

## 6. FIREBASE SETUP

### Services Used
- **Firebase Auth** — Google sign-in provider
- **Firestore** — per-user document at `users/{uid}/watchlist`
- **Firebase Analytics** — automatic + custom event tracking

### Firestore Data Structure
```
users/
  {uid}/
    profile:     { name, email, avatar, createdAt }
    watchlist:   { entries[], meta{}, sectionOrder[], lastModified }
```

Single document per user. Simple, fast, cheap on reads/writes.

### Firebase Init
```typescript
// src/lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
export const googleProvider = new GoogleAuthProvider();
```

### Firestore Security Rules
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Firebase Console Setup Steps
1. https://console.firebase.google.com → New Project "CineTrack" → enable Analytics
2. Authentication → Get Started → Google provider → Enable
3. Firestore Database → Create database → production mode → paste rules above
4. Project Settings → Your apps → Add web app → copy config object
5. Paste config values into .env.local and Vercel env vars

### Analytics Events to Track
```typescript
// logEvent(analytics, eventName, params)
'watchlist_entry_added'
'watchlist_entry_deleted'
'watchlist_entry_edited'
'status_changed'           // { from: 'plan', to: 'watching' }
'personal_rating_set'      // { rating: 8 }
'notes_saved'
'platform_set'             // { platform: 'Netflix' }
'sign_in'
'sign_out'
'theme_toggled'            // { theme: 'light' }
'poster_loaded'
'section_reordered'
'export_json'
'import_json'
```
These appear in Firebase Console → Analytics → Events.
You see DAU, MAU, user count, which features are used most.

---

## 7. DATA FLOW

### Guest User (No Sign-In)
```
App loads
  → localStorage check → if data: load it
  → if empty: write seed data to localStorage
  → renders full list
  → AuthBanner shown: "Sign in with Google to sync across devices"
  → All changes saved to localStorage only
```

### Sign-In Flow
```
User clicks "Sign in with Google"
  → Firebase Auth Google popup (browser-native)
  → auth.currentUser available with uid, name, email, avatar
  → check Firestore: users/{uid}/watchlist exists?
    → YES: load Firestore data → merge with localStorage → Firestore wins
    → NO (new user): write seed + any localStorage changes to Firestore
  → AuthBanner disappears
  → UserProfile chip appears in header (avatar + name)
  → analytics: log 'sign_in'
```

### Every Change (Add / Delete / Edit / Status / Rating / Notes / Reorder)
```
User action
  → React state updates instantly (optimistic UI)
  → localStorage.setItem (always, instant)
  → if signed in: debounced 1.5s → setDoc Firestore (merge: true)
  → Cursor glow pulses brighter for 0.6s
  → Toast notification appears bottom-right
  → analytics: log relevant event
```

### Return Visit (Signed In)
```
App loads
  → Firebase Auth restores session automatically (persistent)
  → localStorage renders fast first paint
  → Firestore fetch background → compare lastModified → Firestore wins if newer
  → Seamless reconcile, no flash
```

---

## 8. FEATURES LIST

### Core Features
- [x] Seed movie catalog (7 recent diverse entries as starting list)
- [x] Status cycling: Plan to Watch → Watching → Watched (click badge)
- [x] Add custom entry (modal form)
- [x] Edit existing entry (pre-filled modal)
- [x] Delete entry (confirm dialog)
- [x] Filter by section, type, status, platform
- [x] Search by title, genre, country (instant, animated)
- [x] Stats bar: Total, Watched, Watching, Plan to Watch
- [x] Animated progress bar with percentage

### Auth & Sync
- [x] Guest mode (localStorage, no sign-in required)
- [x] Google Sign-In via Firebase Auth (persistent sessions)
- [x] Firestore auto-sync on every change (debounced 1.5s)
- [x] "Sign in to sync" banner for guests (dismissible)
- [x] Export JSON (manual backup, always available)
- [x] Import JSON (manual restore / migration)
- [x] "Last synced: X mins ago" indicator in header

### User Profile
- [x] Google avatar + name chip in header when signed in
- [x] Profile dropdown: account info, theme toggle, export, sign out
- [x] Firebase Analytics: developer sees DAU/MAU/events in Firebase Console

### Per-Entry Features
- [x] **Personal Rating** — user's own score, input as number 1-10, displayed as "8/10"
- [x] **Notes / Review** — free text textarea, shown collapsed in row, expanded on click
- [x] **Watched On** — date picker (shadcn/ui Popover + Calendar), stored YYYY-MM-DD
- [x] **Watch Platform** — dropdown: Netflix, Prime Video, Apple TV+, Disney+, HBO Max, YouTube, Torrent, FTB, Other
- [x] **Watch Link** — private URL field for any personal link (streaming deep link, torrent, ftb, etc.) — stored only in user's own Firestore, never shared
- [x] **Poster** — auto-fetched from TMDB API by title + year, shown as small thumbnail (46x69px) beside title. Cached in Firestore. Lazy loaded with fade-in.
- [x] IMDb rating (color coded: green ≥7.5, yellow ≥6.0, red <6.0)
- [x] IMDb link (external ↗)

### UX & Animations
- [x] **Cursor Glow Effect** — radial spotlight follows mouse across dark background (always on)
- [x] **Success Glow Pulse** — cursor glow intensifies briefly on every successful action
- [x] Staggered list entrance on load (Framer Motion)
- [x] Status badge tap animation (scale 0.94) + hover (scale 1.06)
- [x] Toast notifications stack bottom-right (success/error/info)
- [x] Modal open/close with scale + fade animation
- [x] Instant animated search filter (AnimatePresence on list items)
- [x] Scroll to top FAB button
- [x] Fully responsive (mobile + desktop)

### Organization
- [x] **Drag to reorder sections** (Framer Motion drag API, GripVertical handle on hover, persisted)
- [x] Section headers with emoji, accent color, entry count

### Theme & PWA
- [x] **Dark / Light mode toggle** (Tailwind dark: classes, persisted in localStorage, toggled from profile dropdown)
- [x] **PWA support** — manifest.json + vite-plugin-pwa service worker → installable on Android/iOS home screen

---

## 9. POSTER FEATURE — TMDB API

### Why TMDB Not User Upload
- Copyright: hosting IMDb/studio posters = legal risk
- User upload = needs Firebase Storage = complexity + cost
- TMDB = free, official, legal, auto-fetched by title = zero effort for user

### TMDB Free API Setup
1. Register at https://www.themoviedb.org/signup (free)
2. Settings → API → Request Developer API key (approved instantly)
3. Add `VITE_TMDB_API_KEY` to .env.local and Vercel

### Fetch Logic
```typescript
// useTMDB.ts
// GET https://api.themoviedb.org/3/search/movie?query={title}&year={year}&api_key={key}
// Take results[0].poster_path
// Display URL: https://image.tmdb.org/t/p/w92{poster_path}  (tiny = fast)
// Cache posterUrl in Firestore entry so we don't re-fetch on every render
// Fallback: generic film strip icon (Lucide: Film) if TMDB returns nothing
```

---

## 10. CURSOR GLOW EFFECT

Premium cinematic feel — a soft radial gradient follows the mouse. Subtly intensifies on successful actions.

```typescript
// src/hooks/useCursorGlow.ts
import { useEffect, useRef } from 'react';

export function useCursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;
    const move = (e: MouseEvent) => {
      el.style.background = `radial-gradient(600px circle at ${e.clientX}px ${e.clientY}px,
        rgba(99,102,241,0.10) 0%,
        rgba(59,130,246,0.05) 30%,
        transparent 70%)`;
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  return glowRef;
}
```

```tsx
// src/components/layout/CursorGlow.tsx
// Fixed full-screen div, z-index: 0, pointer-events: none
// Sits behind all content
// On success event: Framer Motion animate opacity 0.1 → 0.4 → 0.1 over 0.6s
```

```css
/* index.css — success pulse class toggled on actions */
.glow-pulse {
  animation: glowPulse 0.6s ease-out;
}
@keyframes glowPulse {
  0%   { opacity: 0.1; }
  40%  { opacity: 0.40; }
  100% { opacity: 0.1; }
}
```

---

## 11. DRAG TO REORDER SECTIONS

```tsx
// WatchlistSection.tsx wrapped in motion.div
// drag="y"
// dragConstraints: ref to parent container
// layout prop on each section for smooth reflow animation
// GripVertical icon (Lucide) shown on section header hover as drag handle
// onDragEnd: update sectionOrder array → save to Firestore
// Framer Motion handles the visual reordering automatically with layout prop
```

Section order stored in `watchlistState.sectionOrder: Section[]`.

---

## 12. ADD / EDIT MODAL FIELDS

Modal handles both Add New and Edit (pre-fills all fields when editing).

```
Required:
  Title *                    text input

Optional:
  Year                       text input (e.g. 2024)
  Country                    text input
  Genre                      text input
  IMDb Rating                text input (e.g. 8.3 or N/A)
  IMDb URL                   url input
  Section                    dropdown (8 predefined + custom text option)
  Type                       dropdown: Film / Series
  Status                     dropdown: Plan to Watch / Watching / Watched
  Personal Rating            number 1-10 (displayed as "8/10" in row)
  Watched On                 date picker (shadcn Calendar in Popover)
  Watch Platform             dropdown: Netflix, Prime Video, Apple TV+,
                               Disney+, HBO Max, YouTube, Torrent, FTB, Other
  Watch Link                 url input (private, personal use — any URL)
  Notes / Review             textarea (auto-resizes, max 500 chars)
```

---

## 13. DESIGN SYSTEM & DARK THEME

### Aesthetic Direction
**"Cinematic Dark"** — deep space blacks, electric indigo/blue accents.
Premium streaming dashboard feel. Dense but breathable.
Inspired by: Linear, Vercel dashboard, Raycast.

### Color Palette (CSS Variables)
```css
:root {
  /* Backgrounds — dark mode default */
  --bg-base: #07070f;
  --bg-surface: #0d0d1a;
  --bg-elevated: #111827;
  --bg-hover: #1e293b;

  /* Borders */
  --border-subtle: #1e293b;
  --border-focus: #3b82f6;

  /* Text */
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #475569;
  --text-disabled: #334155;

  /* Accents */
  --accent-blue: #3b82f6;
  --accent-purple: #818cf8;
  --accent-green: #34d399;
  --accent-yellow: #fbbf24;
  --accent-red: #f87171;
  --accent-pink: #f9a8d4;
  --accent-orange: #fdba74;
  --accent-cyan: #67e8f9;

  /* Status */
  --status-plan-bg: #1e1a2e;
  --status-plan-text: #a78bfa;
  --status-plan-border: #4c1d95;
  --status-watching-bg: #1c1500;
  --status-watching-text: #fbbf24;
  --status-watching-border: #78350f;
  --status-watched-bg: #052e16;
  --status-watched-text: #34d399;
  --status-watched-border: #064e3b;
}

/* Light mode overrides */
.light {
  --bg-base: #f8fafc;
  --bg-surface: #ffffff;
  --bg-elevated: #f1f5f9;
  --bg-hover: #e2e8f0;
  --border-subtle: #e2e8f0;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
}
```

### Typography
```
Display / Header:  "Syne" (Google Fonts) — geometric, cinematic
Body / UI:         "DM Sans" (Google Fonts) — clean, readable
Mono (ratings):    "JetBrains Mono" — technical, numbers
```

### Framer Motion Animation Specs
```typescript
// List stagger
const listVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } }
};

// Status badge
whileHover={{ scale: 1.06, filter: 'brightness(1.15)' }}
whileTap={{ scale: 0.94 }}

// Modal
hidden: { opacity: 0, scale: 0.96, y: 12 }
visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2 } }

// Toast
hidden: { opacity: 0, x: 60, scale: 0.9 }
visible: { opacity: 1, x: 0, scale: 1 }
exit: { opacity: 0, x: 60, scale: 0.9 }

// Section drag reorder
// layout prop on motion.div for smooth reflow
// drag="y" with dragConstraints
```

### Component Rules
- Cards: `rounded-xl`
- Modals: `bg-surface/80 backdrop-blur-xl border border-white/5`
- Shadows: glow not drop: `shadow-[0_0_30px_rgba(99,102,241,0.08)]`
- Focus: `ring-2 ring-blue-500/50`
- Row hover: `bg-white/[0.025]`
- Section headers: left border in section accent color + subtle tinted bg

---

## 14. ENVIRONMENT VARIABLES

```bash
# .env.local (never commit this)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_TMDB_API_KEY=

# .env.example (commit this — empty values as template)
VITE_FIREBASE_API_KEY=your_value_here
VITE_FIREBASE_AUTH_DOMAIN=your_value_here
VITE_FIREBASE_PROJECT_ID=your_value_here
VITE_FIREBASE_STORAGE_BUCKET=your_value_here
VITE_FIREBASE_MESSAGING_SENDER_ID=your_value_here
VITE_FIREBASE_APP_ID=your_value_here
VITE_FIREBASE_MEASUREMENT_ID=your_value_here
VITE_TMDB_API_KEY=your_value_here
```

Add all to Vercel → Project Settings → Environment Variables.

---

## 15. PWA SETUP

```json
// public/manifest.json
{
  "name": "CineTrack",
  "short_name": "CineTrack",
  "description": "Your personal movie & series watchlist",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#07070f",
  "theme_color": "#818cf8",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

```typescript
// vite.config.ts — add VitePWA plugin
import { VitePWA } from 'vite-plugin-pwa';

plugins: [
  react(),
  VitePWA({
    registerType: 'autoUpdate',
    manifest: false, // using our own public/manifest.json
    workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] }
  })
]
```

---

## 16. HOW DIFFERENT USERS USE IT

```
Repo:      github.com/yourname/cinetrack  (public)
Live URL:  cinetrack.vercel.app           (public)
```

**Guest User:**
Visits → sees 7 seed movies → tracks status → data in localStorage
Banner: "Sign in to sync across devices"
Risk: data lost if browser cleared

**Signed-In User A:**
Signs in → Firestore document created: users/uidA/watchlist
All changes auto-sync. Opens on phone → same data. Zero effort.

**Signed-In User B (same live URL):**
Completely separate Firestore document: users/uidB/watchlist
No overlap with User A ever. Fully independent.

**You (Developer):**
Firebase Console → Analytics → see total users, DAU, MAU, which features are used
Firestore → browse user documents (for debugging only)
Auth → see registered user count and list

**New User Instructions (put in README.md):**
1. Visit [live link]
2. App works immediately — no signup needed
3. Click status badges to track your progress
4. Use "+ Add New" to add your own titles
5. Click "Sign in with Google" for permanent sync across all devices
6. That's it.

---

## 17. LOCALSTORAGE KEYS

```
cinetrack_state_v1     →  WatchlistState JSON (guest mode + fast cache)
cinetrack_theme        →  'dark' | 'light'
```

For signed-in users, Firestore is always the source of truth.
localStorage = fast first-paint cache + fallback for guests.

---

## 18. DEPLOYMENT

```bash
# Create project
npm create vite@latest cinetrack -- --template react-ts
cd cinetrack

# Install dependencies
npm install framer-motion lucide-react firebase
npm install @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-popover
npm install class-variance-authority clsx tailwind-merge
npm install -D tailwindcss postcss autoprefixer vite-plugin-pwa
npx tailwindcss init -p
npx shadcn@latest init

# Dev server
npm run dev    # localhost:5173

# Production build
npm run build  # outputs to dist/

# Deploy (automatic on every git push)
git add . && git commit -m "feat: initial build"
git push origin main
# Vercel picks it up automatically and deploys
```

---

## 19. WHAT NOT TO BUILD

- No custom auth — Firebase handles it
- No custom server — Firebase IS the server
- No image upload/hosting — TMDB for posters
- No social features — purely personal tracker
- No Next.js / SSR — not needed for this app
- No paid APIs or services

---

## 20. FUTURE FEATURES (v2+)

- **Statistics page** — genres breakdown, most-used platform, watched-per-month chart (Recharts)
- **Discover tab** — TMDB trending/popular shown in-app, add directly to list
- **Collections** — group entries into custom lists ("Watch with family", "Weekend binge")
- **Shareable snapshot** — read-only public URL of their list (base64 encoded, no auth)
- **Browser push notifications** — remind about "Plan to Watch" older than 30 days
- **Keyboard shortcuts** — j/k navigation, s for status, a for add
- **Bulk actions** — multi-select entries, bulk status change / delete
- **Watch history timeline** — visual calendar of what was watched when

---

*This is the single source of truth for CineTrack v2.
Paste this entire file at the start of any Claude conversation to build any feature with full context. No re-explaining needed.*
