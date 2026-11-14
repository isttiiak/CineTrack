# Changelog

All notable changes to CineTrack. Dates are `YYYY-MM-DD`. Versions follow
[Semantic Versioning](https://semver.org/). Earlier history: see the
[v1.0.0 release](https://github.com/isttiiak/CineTrack/releases/tag/v1.0.0).

## [Unreleased]

### Added

- **Settings is now a full page** with a side menu (Display, Streaming, Import & export, Privacy, App & offline,
  Delete data, About) instead of a narrow drawer.
- **Delete data** (Settings): delete selected titles (jumps to multi-select), delete all titles (keeps the
  account), erase everything in this browser (guests), and **delete account and all data** (signed in: cloud
  list, profile, the sign-in record, and everything on the device). The last three need typing DELETE and
  offer a backup download first.
- **Consent banner for the EU/EEA, UK and Switzerland**: usage statistics are opt-in there (nothing is
  collected until you say yes) and stay opt-out elsewhere. Region comes from `/api/region` (the host's
  country header); the time zone is only a fallback. Do Not Track / Global Privacy Control still win.
- **Marvel section**, preselected when adding a Marvel title from Discover (detected from TMDB production
  companies), plus a bulk **Move to section** action in the multi-select bar.
- PWA: install button and iPhone instructions (Settings → App & offline), a "new version" reload prompt,
  an offline notice, app shortcuts (Discover, Upcoming), maskable and Apple touch icons.

- **Smarter Discover search**, no AI needed: searching a director, writer or actor ("nolan", "zendaya")
  shows their whole filmography as a group above the normal results; searching a studio or franchise
  ("marvel", "pixar", "a24", "star wars", "the avengers") shows its titles. Groups show a dozen titles with
  "Show all" and can be added from directly.

### Fixed

- **Invisible Cancel button** in the delete dialog (and other `text-base` text): a stray `base` colour in the
  Tailwind config also generated `text-base` as a near-black text colour.
- PWA offline support: posters, Google Fonts and TMDB/ratings answers are now cached, the new service worker
  takes over at once so a refresh always gives the newest version, and a missing `favicon.ico` 404 is gone.

## [1.2.2] - 2026-11-13

Dependency updates only; no change to how the app works.

### Changed

- `lucide-react` 0.400 → 1.71 (icons checked: all render).
- `eslint-plugin-react-refresh` 0.4 → 0.5.
- CI actions `actions/checkout` and `actions/setup-node` 4 → 7.
- Dependabot no longer proposes major bumps of `@types/node` (must match the Node 22 runtime) or
  `lucide-react` (upgrade those by hand).

## [1.2.1] - 2026-11-13

A new pink look, a clearer working area in the details drawer, and a long-term maintenance pass.

### Changed

- **New accent**: a pink-to-rose gradient (`#d43795`) replaces the gold, with brighter small text for
  contrast. Favicon and app icons updated to match.
- Details drawer: public ratings now sit directly under the poster, above Status. The open title is
  highlighted (card or row, and the drawer itself) so it is clear where you are working. "Done" on the
  watch date shows a check icon, and the date card has a bordered hover state.
- Faster first load: Discover, Upcoming, Settings, Analytics and import load on demand, and Firebase and
  animation code are separate cacheable chunks.
- A list is now capped at 1200 titles (was 2000) so it can never exceed Firestore's 1 MB document limit.

### Added

- Error screen instead of a blank page if something unexpected breaks (your list stays safe).
- Dependabot (monthly, grouped), `.nvmrc` and `engines` for a low-maintenance upgrade path.

### Removed

- Unused starter files (`App.css`, template assets, an unused cursor-glow component).

## [1.2.0] - 2026-11-13

A daily-use details drawer, watch dates you can record as precisely as you remember them, a Coming
soon feed, smarter recommendations, and a new dark-only look.

### Added

- **Details drawer redesigned for daily use**: status, watch date, rating, episode progress,
  platform and notes are all edited in place. Notes save and cancel inline. "Edit details" is
  now only for the rarely-changed facts.
- **Flexible watch date**: record the exact day, just a month, or just a year (it can't be in the
  future). Marking something watched still fills in today and now highlights the date card so you
  can correct it in one tap. The same picker is in the Edit form and the Discover add dialog.
- **Coming soon** tab in Discover: the most anticipated films and series of the next year, grouped
  by month. Unreleased titles show "Releases <date>" on their card and can only be added as Plan to
  Watch. The Upcoming tab links to it.

### Changed

- **New look**: a dark-only "cinema noir" theme with a gold-to-ember accent replaces the purple one.
  The light theme and its toggle are gone.
- **"For you" is smarter**: it now uses up to 8 titles (it was 4, and ignored titles without a TMDB
  id), weights them by how highly you rated them, prefers titles several of your favourites agree on,
  uses your genre taste, filters out obscure or poorly reviewed picks, and keeps variety. Titles you
  rated 4 or lower no longer seed recommendations.
- Analytics: titles dated only by year or month count in the totals but not the daily heatmap or streaks.

### Fixed

- Why a blockbuster like *Avengers: Doomsday* showed up in Trending: TMDB ranks Trending by
  attention, not release status. It is now labelled with its release date and also listed in Coming soon.

## [1.1.0] - 2026-11-13

A big update: a redesigned watchlist, ratings and streaming info on every title, much smarter
search, a real analytics page, several new ways to add titles, and a security and sync overhaul.

### Highlights

- **Ratings from every major site**: IMDb, Rotten Tomatoes (critics and audience), Metacritic,
  Letterboxd and TMDB, on Discover cards and in each title's details.
- **Where to watch**: streaming, rent and buy options for your country, with the services you
  have highlighted. Pre-fills the Platform when you add a title.
- **Smart search** on both the watchlist and Discover: typo-tolerant, ignores accents, ranked by
  relevance (and popularity on Discover), with filters such as `year:2020-2024 is:watched rating>8`.
- **Analytics page**: insights, time watched, streaks, backlog forecast, monthly and daily
  activity, rating distribution, you-vs-IMDb comparison, genres, decades, countries, platforms.
- **Add titles faster**: paste a list, paste an IMDb/TMDB link anywhere, a browser bookmarklet,
  Android Share, and import from Letterboxd or IMDb.
- **Safer sync**: edits from several devices now merge field by field instead of overwriting each other.

### Added

- **Upcoming tab**: new episodes, season premieres and film releases for titles in your list,
  with an `.ics` calendar export.
- **Episode progress** for series (S2 · E5, `+ Episode`); the status follows automatically.
- **Discover**: "For you" recommendations based on titles you rated highly; search by person
  ("nolan" shows their films); typo correction ("showing results for …"); an add dialog with
  status, optional watch date, rating, platform and section; titles already in your list show
  their status and an Edit button.
- **Country filter** on the watchlist (spellings such as "USA" / "United States" are merged, and
  co-productions count for each country).
- **Duplicate protection**: the Add form suggests TMDB matches while you type, and warns about
  titles you already have, including different spellings, "Part 2" vs "Part Two", typos, or the
  same title filed as a film vs a series.
- **Export formats**: a readable JSON backup (that still restores everything), a spreadsheet
  CSV, and Letterboxd files (watched films with ratings and dates, and your watchlist).
- **Import**: Letterboxd (`.zip` or CSV), IMDb CSV, your own spreadsheet CSV, and pasted lists,
  all matched on TMDB and reviewed before anything is added.
- **Settings panel**: theme, layout, grouping, section order, country and streaming services,
  backup, quick add, and privacy.
- **Privacy note** ([PRIVACY.md](PRIVACY.md)) and a switch to turn off anonymous usage statistics.
- **Keyboard**: `/` or ⌘K focuses search, Esc clears it.
- **Open-source basics**: MIT [license](LICENSE), GitHub Actions CI (lint, tests, build, API
  load check, dependency audit), [CLAUDE.md](CLAUDE.md) project guide and [TODO.md](TODO.md) setup checklist.

### Changed

- **Watchlist layout**: one search box next to the tabs, dropdown filters instead of section
  chips and a sidebar, and a flat poster grid with a small section tag on each card. Grouping by
  section is now an option in Settings.
- **Platform names**: "Torrent" and "FTB" are now **Other**. Existing data is converted
  automatically, on your device and in the cloud.
- **Stats page** is now **Analytics** and is rebuilt (see above); chart colours are
  colour-blind safe in light and dark themes.
- Scores added from Discover are labelled **TMDB**; real IMDb scores are labelled **IMDb**.
- Marking a title watched with one tap records today's date; forms leave the date empty unless you set one.
- Dropdowns are capped to the screen height and scroll, so long lists such as countries work.
- Hover-only controls no longer appear on phones (they showed up on tap as a second button).

### Fixed

- **Discover and posters were blank on the live site**: the server functions crashed on load
  in production (a missing `.js` extension in their imports) while working locally. CI now loads
  them the way Vercel does so this can't happen again.
- Edits made on two devices at once could overwrite each other, and a background poster fetch
  could undo another device's changes.
- Series watch time counted one episode instead of the whole show.
- Stats and charts missing watch dates for titles marked watched.
- Posters sometimes matched the wrong title; they now use the exact TMDB id when known.
- An IMDb score was relabelled as TMDB after the app looked up a missing TMDB id.
- Sign-in on an iPhone home-screen app (it now falls back to a full-page redirect).

### Security

- The TMDB key is no longer in the browser bundle: all TMDB calls go through an allowlisted
  server function. The ratings keys also stay server-side.
- Tighter Firestore rules (size and type limits). The profile no longer stores your email address.
- Content-Security-Policy and other security headers.
- Firebase 13 and Vite 8; the production dependency audit reports no vulnerabilities.
- Optional Firebase App Check support (off until a site key is configured).

### Upgrade notes (if you run your own deployment)

1. **Environment variables**: rename `VITE_TMDB_API_KEY` to `TMDB_API_KEY` (no `VITE_` prefix,
   and rotate the key if you ever deployed the old one). Optionally add `MDBLIST_API_KEY` and
   `OMDB_API_KEY` for ratings. See `.env.example`.
2. **Publish `firestore.rules`** (Firebase Console → Firestore → Rules).
3. **Node.js 20.19+ (or 22.12+)** is required to build.
4. Existing lists upgrade automatically. Old backup files (version 1) still import.

[1.2.0]: https://github.com/isttiiak/CineTrack/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/isttiiak/CineTrack/releases/tag/v1.1.0
