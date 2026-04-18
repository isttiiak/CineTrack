# 🎬 CineTrack

A personal movie and TV series watchlist tracker. Works instantly as a guest, or sign in with Google for permanent cloud sync across all your devices.

**Live:** [cine-track-silk.vercel.app](https://cine-track-silk.vercel.app)

![CineTrack Screenshot](https://cine-track-silk.vercel.app/icon-512.png)

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
| Posters | TMDB API (free) |
| Hosting | Vercel |
| PWA | vite-plugin-pwa |

---

## Getting Started Locally

### Prerequisites
- Node.js 18+
- A Firebase project ([console.firebase.google.com](https://console.firebase.google.com))
- A TMDB API key ([themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)) — optional

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
VITE_FIREBASE_MEASUREMENT_ID=
VITE_TMDB_API_KEY=          # optional — posters won't load without it
```

### 3. Firebase setup

1. **Authentication** → Sign-in method → Google → Enable
2. **Firestore** → Create database → Production mode → apply rules below:

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

### 4. Run

```bash
npm run dev
# Open http://localhost:5173
```

---

## Deployment (Vercel)

1. Push to GitHub
2. Import project at [vercel.com](https://vercel.com)
3. Add all env vars from `.env.local` to Vercel → Project Settings → Environment Variables
4. Every `git push` to `main` auto-deploys

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
├── lib/                firebase.ts, firestore.ts, utils.ts
└── types/              index.ts (all TypeScript interfaces)
```

---

## Data Model

Each signed-in user gets one Firestore document:

```
users/{uid}/data/watchlist   → { entries[], meta{}, sectionOrder[], lastModified }
users/{uid}/data/profile     → { name, email, avatar, updatedAt }
```

Guest users store the same shape in `localStorage` under `cinetrack_state_v1`.

---

## License

MIT — use it, fork it, make it yours.
