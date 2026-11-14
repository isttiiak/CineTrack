# <img src="public/favicon.svg" alt="CineTrack logo" width="48" style="height:auto;" /> CineTrack

[![CI](https://github.com/isttiiak/CineTrack/actions/workflows/ci.yml/badge.svg)](https://github.com/isttiiak/CineTrack/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A personal movie and TV series watchlist tracker. Works instantly as a guest, or sign in with Google for permanent cloud sync across all your devices.




**Live:** [cine-track-silk.vercel.app](https://cine-track-silk.vercel.app)

---

## Features

### Watchlist
- **Plan to Watch → Watching → Watched**: tap the badge to cycle. Marking something watched records today's date, which you can correct to the exact day, just a month, or just a year.
- **Details drawer built for daily use**: status, watch date, rating, episode progress, platform and notes are all editable in place; "Edit details" is only for the rarely-changed facts
- Personal rating (1–10), notes, platform, private watch link and watched date per title
- **Episode progress** for series (S2 · E5, +1 episode). The status follows automatically: started → Watching, finished an ended show → Watched.
- Flat poster grid (or compact list) with a small section tag; optional grouping by section
- **Smart search**: typo-tolerant ("oppenhiemer"), ignores accents, ranks best matches first, highlights them, and understands filters like `year:2020-2024 is:watched rating>8 genre:thriller`. Press `/` or ⌘K to search. On Discover, results are ranked by match then popularity, typos are corrected ("showing results for …"), and searching a person ("nolan") shows their films.
- Filter by section / country / type / status / platform, and sort
- **Duplicate protection**: the Add form suggests TMDB matches as you type and warns about titles you already have (even with typos, a different type, or "Part 2" vs "Part Two"). Discover cards show titles already in your list, with an Edit button.
- Bulk select, duplicate detection, stats (hours watched, heatmap, genres, platforms)

### Adding titles
- Search Discover (or paste an IMDb / TMDB link) and add with status, date, rating and platform
- The Add form suggests TMDB matches as you type and fills in everything
- **Paste a list**: one title per line from notes or chats, matched and reviewed before adding
- Paste a link or a list **anywhere** in the app
- **Bookmarklet** (Settings → Import & export): click "+ CineTrack" on any IMDb, TMDB or Letterboxd page
- Android: Share → CineTrack; imports from Letterboxd and IMDb

### Analytics
- Insights, time watched (films vs series), weekly streaks, backlog and time to clear it
- Monthly and day-by-day activity, rating distribution, you vs IMDb/TMDB
- Top genres with your average rating, decades, countries, platforms, section completion
- All time or any single year

### Ratings & where to watch
- **Ratings from IMDb, Rotten Tomatoes (critics + audience), Metacritic, Letterboxd and TMDB** on Discover cards and in each title's details (needs a free MDBList or OMDb key, see below)
- **Where to watch** in your country: streaming, rent and buy options (data by JustWatch), with the services you have highlighted and used to pre-fill Platform
- Posters, genres, runtime and IMDb links filled in automatically from TMDB

### Discover
- Trending, popular movies, popular TV, **Coming soon**, and **For you**: recommendations weighted by how highly you rated things, favouring titles several of your favourites agree on, and ignoring titles you rated 4 or lower
- Search any title, or **paste an IMDb / TMDB link** to jump to that exact title
- Adding asks for status, watch date (optional), rating, platform and section, so already-watched titles can be logged properly

### Upcoming
- **Coming soon** (in Discover): the most anticipated films and series of the next year, grouped by month. Unreleased titles can only be added as Plan to Watch
- New episodes, season premieres and film releases for titles in your list, plus "just aired" and "returning, date TBA"
- **Add to calendar**: download an `.ics` file for Google / Apple / Outlook Calendar

### Import & sync
- **Import from Letterboxd** (the export `.zip`, or `diary.csv` / `ratings.csv` / `watched.csv` / `watchlist.csv`) and **IMDb** (ratings or watchlist CSV). Titles are matched on TMDB and uncertain matches are shown for review first.
- Export a **backup** (readable JSON that also restores everything), a **spreadsheet** (CSV for Excel / Google Sheets), or **Letterboxd** files (watched films with ratings and dates, and your watchlist) to move your films there
- Import a CineTrack backup or spreadsheet (merge or replace)
- Guest mode (no sign-in) or Google sign-in with Firestore sync. Edits from several devices are merged field by field.

### App
- Installable PWA that works offline (your list, the app and posters you have seen). On Android, **Share → CineTrack** from the IMDb app (or any link) opens that title ready to add.
- Full-page Settings: layout, cursor glow, grouping, card details, section order, country, your services, backup, install, privacy choice
- **Delete options**: selected titles, all titles, erase this browser, or delete your account with every piece of data
- Sections include Marvel; the bulk bar can move titles between sections
- One dark, cinematic theme (near-black with a pink accent), fully responsive

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 8 |
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
MDBLIST_API_KEY=                       # optional — IMDb / Rotten Tomatoes / Metacritic / Letterboxd ratings
OMDB_API_KEY=                          # optional — fallback ratings source (IMDb / RT / Metacritic)
```

`VITE_*` values are compiled into the browser bundle and are public by design (Firebase web
config is meant to be public; the security rules protect the data). **`TMDB_API_KEY` must not
have the `VITE_` prefix**: it's only read by the `/api/tmdb` proxy (`api/tmdb.ts` on Vercel, a
Vite middleware locally), so it never reaches the browser. The same goes for the ratings keys,
used by `/api/ratings`.

**Ratings keys.** [MDBList](https://mdblist.com/preferences/) (free account → Preferences → API)
gives the most sources; [OMDb](https://www.omdbapi.com/apikey.aspx) is a fallback. Both free tiers
allow about 1,000 requests a day *per account, shared by every visitor*. Responses are cached on
the CDN for a day and on each device for a week, so popular titles cost one request a day in total.
Without a key the app simply hides those ratings.

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

The app opens fullscreen with no browser bar, just like a native app. Settings → App & offline shows the right steps for your device.

The service worker only exists in a production build. To try the PWA locally: `npm run build && npm run preview` (http://localhost:4173), not `npm run dev`.

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
├── tmdb.ts             Vercel Function: TMDB proxy that keeps the API key server-side
└── ratings.ts          Vercel Function: IMDb / RT / Metacritic / Letterboxd ratings (MDBList or OMDb)
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

## Contributing

- [`CLAUDE.md`](CLAUDE.md): architecture, data model, sync algorithm and conventions (read this first).
- [`TODO.md`](TODO.md): setup steps that need account access (keys, Firebase rules, App Check).
- Run `npm test`, `npm run lint` and `npm run build` before opening a PR.

---

## License

[MIT](LICENSE): use it, fork it, make it yours. Title data, posters and streaming availability come from
[TMDB](https://www.themoviedb.org/) and JustWatch, and ratings from MDBList / OMDb; those services have their own
terms (TMDB's API is free for non-commercial use). See [PRIVACY.md](PRIVACY.md) for what data the app stores and sends.
