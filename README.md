# <img src="public/favicon.svg" alt="CineTrack logo" width="48" style="height:auto;" /> CineTrack

A personal movie and TV series watchlist tracker. Works instantly as a guest, or sign in with Google for permanent cloud sync across all your devices.




**Live:** [cine-track-silk.vercel.app](https://cine-track-silk.vercel.app)

---

## Features

### Watchlist
- Track movies and series across custom sections (General, K-Drama, Crime, etc.)
- Three status states — **Plan to Watch → Watching → Watched** — click the badge to cycle
- Personal rating (1–10) separate from IMDb rating
- Notes / review per entry (up to 500 characters)
- Watch platform tagging (Netflix, Prime Video, Disney+, etc.)
- Private watch link (personal URL — only visible to you)
- Watched date tracking
- TMDB poster auto-fetch by title — no manual uploads needed

### Auth & Sync
- **Guest mode** — works immediately, no sign-in required (localStorage)
- **Google Sign-In** — one click, syncs to Firestore in real-time
- Debounced auto-save (1.5s after any change)
- Export / Import JSON backup at any time
- "Last synced" timestamp in header

### UI
- Dark / Light theme toggle (dark is default)
- Cursor glow spotlight effect
- Staggered list entrance animations (Framer Motion)
- Smooth card hover with border highlight
- Animated status badge transitions
- Interactive delete confirmation dialog
- Toast notifications (success / error / info)
- Collapsible sections with entry counts
- Scroll-to-top FAB button
- Fully responsive — mobile and desktop
- Installable as a PWA (Add to Home Screen on iOS/Android)

### Filtering
- Search by title, genre, or country
- Filter by section, type (Film/Series), status, or platform
- One-click clear all filters
- Sort alphabetically and imdb rating

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS v3 |
| Animations | Framer Motion |
| Icons | Lucide React |
| Auth | Firebase Auth (Google) |
| Database | Firestore (per-user document) |
| Posters | TMDB API (free), via a server-side proxy |
| Hosting | Vercel |
| PWA | vite-plugin-pwa |

---

## Getting Started Locally

### Prerequisites
- Node.js 20.19+ (or 22.12+)
- A Firebase project ([console.firebase.google.com](https://console.firebase.google.com))
- A TMDB API key or read access token ([themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)) — optional

### 1. Clone and install

```bash
git clone https://github.com/isttiiak/CineTrack.git
cd CineTrack
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` with your Firebase config:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=          # optional — enables Firebase Analytics
VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=    # optional — enables Firebase App Check
TMDB_API_KEY=                          # optional — posters & Discover need it (server-side only)
```

`VITE_*` values are compiled into the browser bundle and are public by design (Firebase web
config is meant to be public; the security rules protect the data). **`TMDB_API_KEY` must not
have the `VITE_` prefix**: it's only read by the `/api/tmdb` proxy (`api/tmdb.ts` on Vercel, a
Vite middleware locally), so it never reaches the browser.

### 3. Firebase setup

1. **Authentication** → Sign-in method → Google → Enable
2. **Firestore** → Create database → Production mode → paste the contents of
   [`firestore.rules`](firestore.rules) into the Rules tab (or `firebase deploy --only firestore:rules`).
   Each user can only read and write their own documents, with size limits.
3. **Lock down the public config** (recommended for any public deployment):
   - Authentication → Settings → **Authorized domains**: keep only `localhost` and your real domains.
   - Google Cloud Console → APIs & Services → Credentials → your browser API key →
     **Application restrictions: Websites**, listing your domains.
   - **App Check** (blocks scripts that reuse your config): create a reCAPTCHA Enterprise key, register it
     under Firebase Console → App Check, set `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`, deploy, and once the
     metrics show verified traffic, click **Enforce** for Firestore and Authentication. In `npm run dev`,
     a debug token is printed to the console; register it under App Check → Manage debug tokens.

### 4. Run

```bash
npm run dev
# Open http://localhost:5173
```

Other scripts: `npm test` (unit tests), `npm run lint`, `npm run build`, and `npm run preview`
(serves the production build with the same security headers as Vercel, useful for checking the CSP).

---

## Deployment (Vercel)

1. Push to GitHub
2. Import project at [vercel.com](https://vercel.com)
3. Add all env vars from `.env.local` to Vercel → Project Settings → Environment Variables
   (`TMDB_API_KEY` without the `VITE_` prefix)
4. Every `git push` to `main` auto-deploys

`vercel.json` sets the security headers (Content-Security-Policy, frame blocking, etc.). If you add a
new third-party script, image host or API, add its origin to the CSP there.

---

## Using on Mobile

**Install as an app (PWA):**
- **iPhone / iPad** — Open in Safari → Share button → "Add to Home Screen"
- **Android** — Open in Chrome → three-dot menu → "Add to Home Screen" or "Install app"

The app opens fullscreen with no browser bar, just like a native app.

---

## Project Structure

```
src/
├── components/
│   ├── auth/           AuthBanner (guest sign-in prompt)
│   ├── filters/        FilterBar (search + dropdowns)
│   ├── layout/         Header, UserProfile, CursorGlow
│   ├── ui/             Button, Dialog, Select, Input, Toast, ConfirmDialog, ...
│   └── watchlist/      WatchlistSection, MovieRow, StatusBadge, RatingBadge, PosterThumb, AddModal
├── data/               seedMovies.ts (7 default entries)
├── hooks/              useAuth, useFirestore, useWatchlist, useTMDB, useCursorGlow, useToast
├── lib/                firebase, firestore, merge (sync), schema, tmdb, analytics, utils
└── types/              index.ts (all TypeScript interfaces)
api/
└── tmdb.ts             Vercel Function: TMDB proxy that keeps the API key server-side
```

---

## Data Model

Each signed-in user gets one Firestore document:

```
users/{uid}/data/watchlist   → { entries[], meta{}, sectionOrder[], lastModified }
users/{uid}/data/profile     → { uid, name, avatar, updatedAt }
```

Guest users store the same shape in `localStorage` under `cinetrack_state_v1`.

**Sync.** Saves run in a Firestore transaction that three-way merges the cloud copy with the local
one, using the last cloud version the device saw as the common ancestor (`src/lib/merge.ts`). Edits
from several devices are combined field by field, so a phone and a laptop editing at the same time
don't overwrite each other, and the result never depends on device clocks.

**Analytics.** Only sent when `VITE_FIREBASE_MEASUREMENT_ID` is set, and never when the browser
signals Do Not Track or Global Privacy Control. Events carry no titles, notes or links.

---

## License

MIT — use it, fork it, make it yours.
