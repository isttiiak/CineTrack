# Changelog

All notable changes to CineTrack. Dates are `YYYY-MM-DD`. Versions follow
[Semantic Versioning](https://semver.org/). Earlier history: see the
[v1.0.0 release](https://github.com/isttiiak/CineTrack/releases/tag/v1.0.0).

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

[1.1.0]: https://github.com/isttiiak/CineTrack/releases/tag/v1.1.0
