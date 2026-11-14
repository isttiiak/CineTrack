# Privacy

*Last updated: 2026-11-15*

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

- **EU/EEA, UK and Switzerland: nothing is collected unless you click Allow** in the banner. Elsewhere it
  is on by default and you can turn it off. Either way, change your mind any time in **Settings → Privacy**;
  turning it off stops collection and removes the Google Analytics cookie (`_ga…`).
- Where you are is decided by the hosting provider's country header (derived from your IP address by
  Vercel; the app never sees the address). If that is unavailable, your browser's time zone is used.
- Nothing is collected if your browser sends **Do Not Track** or **Global Privacy Control**.
- Nothing is collected if the deployment has no Analytics configured.
- These statistics are anonymous and can't be linked to your account, so there is nothing to delete on that side.

## Other services your browser or the server talks to

| Service | What it is used for | What it sees |
|---|---|---|
| TMDB (themoviedb.org) | Title data, posters, recommendations, streaming availability | The titles, people and studios you search for, and titles in your list that need a poster or details (title, year, id), sent by the app's server so the API key stays private. Poster images load directly from TMDB, so TMDB also sees your IP address. |
| JustWatch (via TMDB) | "Where to watch" data | Nothing about you. |
| MDBList / OMDb | IMDb, Rotten Tomatoes, Metacritic, Letterboxd ratings | Title ids, sent by the app's server. |
| Google Fonts | The app's fonts | Your IP address when the page loads. |
| Vercel | Hosting and the server functions | Standard request logs (IP address, time, URL), as with any host. |

Your ratings, notes, watch status, dates and saved links are **not** sent to TMDB, MDBList or OMDb.

## Your choices

- **Export** your data any time from Settings → Data (JSON, CSV).
- **Delete titles**: Settings → Delete data: the ones you select, or all of them (your account stays).
- **Delete local data**: Settings → Delete data → *Erase everything in this browser* (or clear your
  browser's site data; signing out also clears the signed-in list from the device).
- **Delete your account and all data**: Settings → Delete data → *Delete account*. It permanently removes
  your list and profile record from Firestore, your sign-in record (name, email address, photo link) from
  Firebase Authentication, and everything CineTrack stored on that device. Google may ask you to sign in
  again first. You can download a backup beforehand. (If the app is unavailable, contact the operator.)
- Remove the app's access to your Google account at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## For people running their own deployment

You decide whether Analytics is on (set or leave out `VITE_FIREBASE_MEASUREMENT_ID`). The app asks
for opt-in consent from visitors in the EU/EEA, UK and Switzerland, using the `x-vercel-ip-country`
header (`api/region.ts`); on another host that header is missing, so it falls back to the time zone and
asks whenever it can't tell. Other regions with consent rules (for example Brazil, parts of Asia) are
not treated specially. This page is not legal advice.

## Changes

Updates to this page are committed to the repository, so the history is public. The date above
shows the latest change.
