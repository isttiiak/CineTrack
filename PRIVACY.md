# Privacy

*Last updated: 2026-11-13*

CineTrack is a personal watchlist app. It is built to keep your list yours: it works without an
account, it has no ads, and it doesn't sell or share your data. This page says exactly what is
stored and sent where. It describes the code in this repository; a fork or self-hosted copy
may be set up differently, so check with whoever runs it.

## What stays on your device

Your watchlist (titles, ratings, notes, watch dates, links you saved), your display settings, and
a cache of ratings are kept in your browser's local storage. As a guest, that is the only place
your list exists. Clearing your browser's site data removes it, and so does **Sign out** when
you are signed in (it clears the signed-in list from that device).

## If you sign in with Google

- **Firebase Authentication** (Google) handles sign-in. It keeps your account identifier, name,
  email address and profile photo URL.
- **Firestore** (Google) stores your list under your account so it syncs between your devices,
  and a small profile record (account identifier, display name, photo URL; not your email).
- Security rules allow only you to read or write your own data.
- **The person who runs a deployment has administrator access** to that project's database and
  can technically see stored lists. Don't put anything in notes or links that you would not want
  the operator to be able to see. Self-hosting gives you full control.

## Anonymous usage statistics

If the deployment has Firebase Analytics turned on, CineTrack sends anonymous usage events so the
operator can see which features are used. Events are things like `status_changed`,
`watchlist_entry_added`, `sign_in`, `platform_set`, `export_json`, with generic values such as
the type (film/series), a count, or a rating number. **Titles, notes, links and search text are
never included.**

Like all Google Analytics products, it also collects standard technical data automatically: a
random identifier stored in your browser, browser and device type, language, and approximate
location derived from your IP address. This is processed by Google under
[Google's privacy policy](https://policies.google.com/privacy).

You are in control:

- Turn it off any time in **Settings → Privacy**.
- Nothing is collected if your browser sends **Do Not Track** or **Global Privacy Control**.
- Nothing is collected if the deployment has no Analytics configured.

## Other services your browser or the server talks to

| Service | What it is used for | What it sees |
|---|---|---|
| TMDB (themoviedb.org) | Title data, posters, recommendations, streaming availability | The titles you search for, and titles in your list that need a poster or details (title, year, id), sent by the app's server so the API key stays private. Poster images load directly from TMDB, so TMDB also sees your IP address. |
| JustWatch (via TMDB) | "Where to watch" data | Nothing about you. |
| MDBList / OMDb | IMDb, Rotten Tomatoes, Metacritic, Letterboxd ratings | Title ids, sent by the app's server. |
| Google Fonts | The app's fonts | Your IP address when the page loads. |
| Vercel | Hosting and the server functions | Standard request logs (IP address, time, URL), as with any host. |

Your ratings, notes, watch status, dates and saved links are **not** sent to TMDB, MDBList or OMDb.

## Your choices

- **Export** your data any time from Settings → Data (JSON, CSV).
- **Delete local data**: clear your browser's site data (or sign out, if you are signed in).
- **Delete cloud data**: open an issue at
  [github.com/isttiiak/CineTrack/issues](https://github.com/isttiiak/CineTrack/issues) (without
  including personal details) or contact the operator of the deployment you use, and the
  Firestore documents and sign-in record will be removed.
- Remove the app's access to your Google account at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## For people running their own deployment

You decide whether Analytics is on (set or leave out `VITE_FIREBASE_MEASUREMENT_ID`). If you
have visitors from the EU, UK or other regions with consent rules for analytics cookies and
identifiers, you may need to ask for consent before collecting; this app provides an opt-out
switch and respects Do Not Track, but not a consent prompt. This page is not legal advice.

## Changes

Updates to this page are committed to the repository, so the history is public. The date above
shows the latest change.
