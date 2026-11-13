# CineTrack: project guide

Context for anyone (human or AI) working on this repo. Keep it accurate: update it in the same
change whenever architecture, data shape, env vars or conventions change.

## What it is

A personal movie & TV watchlist web app. Works instantly as a guest (localStorage); signing in
with Google syncs the list to Firestore. Open source, one public deployment, every user's data
private. No custom backend beyond two small Vercel Functions that keep API keys server-side.

Principles: zero friction, never lose data, automatic over manual, private by default.

## Stack

React 18 + TypeScript · Vite 8 · Tailwind CSS 3 · Radix UI primitives (shadcn-style, `src/components/ui`)
· Framer Motion · Lucide icons · Firebase 13 (Auth, Firestore, optional App Check & Analytics)
· TMDB (titles, posters, providers) · MDBList / OMDb (ratings) · Vercel (hosting + Functions)
· vite-plugin-pwa · Vitest.

Scripts: `npm run dev` (5173) · `npm test` · `npm run lint` · `npm run build` ·
`npm run preview` (production build **with** the `vercel.json` security headers, for checking the CSP).

## Layout

```
api/                    Vercel Functions (files starting with _ are shared code, not functions)
  tmdb.ts  _tmdb.ts       TMDB proxy: allowlisted paths/params, adds the key server-side
  ratings.ts _ratings.ts  IMDb/RT/Metacritic/Letterboxd ratings via MDBList, OMDb fallback
src/
  App.tsx               Tabs (Watchlist / Discover / Upcoming), toolbar, dialogs, wiring
  components/
    discover/           DiscoverPage, DiscoverCard, AddFromDiscoverDialog
    filters/            SearchBox (tab-row search), FilterBar (dropdown filters + sort)
    import/             ExternalImportDialog (Letterboxd / IMDb CSV & ZIP)
    layout/             Header, UserProfile
    profile/            ProfilePage (Analytics)
    ratings/            RatingsRow, WhereToWatch
    settings/           SettingsPanel
    upcoming/           UpcomingPage
    watchlist/          EntryCard (grid), EntryRow (list), EntryDrawer (details), AddModal, PosterThumb, StatusBadge
    ui/                 Radix-based primitives, toast, dialogs, HighlightText
  hooks/                useWatchlist (state + sync), useFirestore (debounced saves), useAuth,
                        usePreferences, useTMDB (posters), useTMDBDiscover, useRatings,
                        useRecommendations, useUpcoming, useTitleSuggestions, useToast, useCursorGlow
  lib/
    firebase.ts firestore.ts   init (App Check optional) + load / transactional sync / profile
    merge.ts                   three-way merge of watchlist states (the sync algorithm)
    schema.ts                  normalizeState: sanitises ALL untrusted input (import, LS, Firestore)
    search.ts                  watchlist search: parse, filters, fuzzy match, ranking, highlight
    discoverSearch.ts          Discover search: relevance tiers + popularity, typo recovery, people
    stats.ts                   everything on the Analytics page (pure, tested)
    duplicates.ts              findDuplicate (strict) / findSimilar (Add-form warning)
    titleData.ts               TMDB details/ratings/providers, id resolution, matching
    tmdb.ts                    client for /api/tmdb      links.ts  IMDb/TMDB link parsing
    csvImport.ts importMatch.ts  external import + pasted lists → candidates → TMDB matching
    exporters.ts download.ts     export formats (JSON v2, spreadsheet CSV, Letterboxd CSV)
    progress.ts ics.ts analytics.ts utils.ts
  types/index.ts        MovieEntry, WatchMeta, WatchlistState, …
firestore.rules         Security rules (deploy separately, see TODO.md)
vercel.json             Security headers incl. Content-Security-Policy
```

## Data model

```ts
MovieEntry  { id, title, year, type: 'Film'|'Series', section, country, genre, imdbRating,
              ratingSource?: 'imdb'|'tmdb', imdbUrl, posterUrl?, tmdbId?, isCustom }
WatchMeta   { id, status: 'plan'|'watching'|'watched', personalRating?, notes?, watchedOn?,
              watchPlatform?, watchLink?, duration?, progressSeason?, progressEpisode? }
WatchlistState { entries[], meta: Record<id, WatchMeta>, sectionOrder[], lastModified }
```

- Firestore: `users/{uid}/data/watchlist` (the whole state, one document) and
  `users/{uid}/data/profile` (`{ uid, name, avatar, updatedAt }`, no email).
- Every field is a primitive: the merge compares fields with `!==`. Don't add nested objects to
  entries or meta (use flat fields like `progressSeason` / `progressEpisode`).
- New fields must be added to `schema.ts` (`normalizeEntry` / `normalizeMeta`), or they are
  dropped on load. Firestore rules check top-level keys and sizes only.
- `imdbRating` may hold a TMDB score: always label it via `ratingSourceOf(entry)`.

### localStorage keys (per device)

`cinetrack_state_v1` list cache / guest data · `cinetrack_base_v1` last cloud version seen (merge
base) · `cinetrack_last_uid` · `cinetrack_prefs` display prefs · `cinetrack_theme` ·
`cinetrack_view` · `cinetrack_ratings_v1` ratings cache (7 days).

## Sync (read before touching useWatchlist / useFirestore / merge)

- Edits update React state + localStorage immediately, then mark the list dirty; saves are
  debounced (1.5 s), serialized, and flushed on tab hide, unload, reconnect and sign-out.
- A save is a Firestore **transaction**: read cloud copy → `mergeWatchlist(base, local, cloud)` →
  write. `base` = last cloud version this device saw. Field-level: a field changed locally wins,
  otherwise the cloud value is kept; deletes win over edits. **Device clocks are never compared.**
- Snapshot listener merges other devices' changes into local state the same way.
- First load per account: same user → merge with the stored base; local guest data → add the
  guest's custom entries; another account's data → use the cloud list. Cloud writes are blocked
  until a load succeeds, so a stale cache can never overwrite the cloud.

## External services

| Service | How | Notes |
|---|---|---|
| TMDB | `/api/tmdb?path=…` only (never call api.themoviedb.org from the browser) | Allowlist in `api/_tmdb.ts`; add paths/params there. Non-commercial terms; attribution in Settings → About |
| Watch providers | TMDB `append_to_response=watch/providers` | Must be credited to **JustWatch** wherever shown |
| Ratings | `/api/ratings?tmdb=&type=` | MDBList preferred, OMDb fallback; ~1000 req/day per account shared by all users → CDN cache 1 day, device cache 7 days; app hides ratings without a key |
| Posters | `https://image.tmdb.org/t/p/{w92,w185,w342,w500}` | `posterAt(url, size)` resizes |
| Firebase | client SDK | Config is public by design; protection = rules + App Check + API key referrer restriction |

Environment variables (`.env.example`): `VITE_FIREBASE_*` (public), `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`
(optional App Check), `TMDB_API_KEY`, `MDBLIST_API_KEY`, `OMDB_API_KEY` (server-only, **never**
prefix server keys with `VITE_`, which would ship them in the bundle). `.env.local` is gitignored.

## Features (where they live)

- Watchlist: flat grid/list, optional grouping by section (Settings), section tag on cards,
  filters + sort (`FilterBar`), bulk select, stats (`ProfilePage`).
- Two searches, two jobs. **Watchlist** = find what you have: precision, ranked by match
  quality (never popularity), one-line "not in your list" + link to Discover, no suggestions.
  **Discover** = explore: `lib/discoverSearch.ts` ranks by relevance tier (exact > starts with >
  all words > word prefixes > typo) then popularity (log popularity + log vote count); retries
  shortened words when TMDB finds little (TMDB has no fuzzy search) and reports "showing results
  for …"; adds a searched person's known-for titles; supports `year:`, `is:series|film`,
  `rating>`; empty results → one line + recommendations or trending.
- Watchlist search (`lib/search.ts`, `SearchBox`): all words must match; accent/case/punctuation-insensitive;
  typo-tolerant (1 edit from 4 letters, 2 from 8; never for numbers); ranked (exact title > prefix
  > word > other fields > notes) unless an explicit sort is chosen; filters `year:2020-2024`,
  `year>2015`, `status:`/`is:watched`, `type:`/`is:series`, `genre:`, `country:`, `section:`,
  `platform:`, `rating>8`, `my>=7`, `is:rated`, `has:notes|link|date|progress`, `"exact phrase"`;
  title highlighting; `/` or ⌘K focuses; no results → offer the same search on Discover.
- Duplicates (`lib/duplicates.ts`): strict = same IMDb id / TMDB id+type / normalized title+type
  with compatible years ("Part Two" = "Part 2" = "Part II"). Add form uses `findSimilar` (also
  other type, spacing, typos) and TMDB suggestions; Discover cards show in-list status + Edit.
- Detail drawer: all ratings, where to watch (+ "set platform"), episode progress, auto-enrichment
  (resolves tmdbId, swaps TMDB score for live IMDb rating).
- Discover: trending / for-you / movies / TV, search or pasted IMDb/TMDB link, add dialog
  (status, optional date, rating, platform pre-filled from your services, section).
- Upcoming: next episodes, premieres, releases, just aired, returning; `.ics` export.
- Adding titles: Discover (+ dialog), Add form with TMDB suggestions, **paste a list** (one title
  per line; `candidatesFromText`), paste an IMDb/TMDB link or a list **anywhere** in the app,
  Android share target and the desktop **bookmarklet** (Settings) — both open `/?url=&title=`,
  handled by `sharedTextFrom` (links, Letterboxd slugs, cleaned page titles).
- Import: CineTrack JSON (merge/replace), Letterboxd ZIP/CSV, IMDb CSV, pasted lists — all go
  through match + review (`ExternalImportDialog`), which flags titles already in the list.
- Export (`lib/exporters.ts`): **JSON backup v2** = `{ app, version: 2, exportedAt, source,
  summary, titles[], data }` — `titles` are readable self-contained records (details + your data,
  ids, links, `publicRating {value, source}`), `data` is the exact state for lossless restore.
  Import prefers `data`, falls back to `titles`, still reads v1 (`data` only). **Spreadsheet CSV**
  (UTF-8 BOM, formula-safe cells) re-imports with status/rating/date/TMDB id intact.
  **Letterboxd CSV** (films only): watched (Rating10, WatchedDate, Review) and watchlist.
  Change the format → bump `EXPORT_VERSION` and keep older versions importable.
- Analytics (`lib/stats.ts`, `ProfilePage`): period picker (all time / year), insights, watched,
  time watched (film vs series), weekly streaks, backlog + time to clear at your pace, monthly
  bars, day heatmap, rating histogram, you vs the crowd (IMDb/TMDB), genres with your avg
  rating, decades, countries, platforms, section completion.
- PWA with Android share target (`public/manifest.json` → `?url=` → Discover).

## Conventions

- Treat all external/stored data as untrusted: run it through `normalizeState`; only `safeUrl()`
  values go into `href`/`src`. Never use `dangerouslySetInnerHTML`.
- Auto "watched on" date: only for one-tap status changes (`setStatuses`, progress); forms keep an
  empty date (= unknown).
- Analytics: `track(event, params)` from `lib/analytics.ts`; no titles, notes or links in params.
- New third-party origins must be added to the CSP in `vercel.json`.
- Hover-only UI must use the `mouse:` variant (and touch alternatives `touch:` / `mouse:hidden`),
  not `sm:` — phones "hover" on tap (custom screens in `tailwind.config.ts`).
- Charts use the `--viz-*` tokens in `index.css` (validated for colour-blind separation and
  contrast in both themes); single series = `--viz-seq`, two series = `--viz-1` / `--viz-2`,
  heatmap = `--viz-heat-1..4`. Labels and values use text colours, never the series colour.
- Tests live next to the code (`*.test.ts`); pure logic goes in `lib/` so it can be tested.
- Keep CLAUDE.md, README.md and TODO.md in sync with the code.

## Not in scope

Custom auth or servers, image uploads, social features, SSR, paid APIs.
