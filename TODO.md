# Manual to-do

Tasks that need your accounts, dashboards or devices, so they can't be done from the code.
Tick them off as you go. Items marked *(optional)* can wait.

## Done

- [x] TMDB key rotated and moved server-side (`TMDB_API_KEY`, no `VITE_` prefix)
- [x] Ratings keys added (`MDBLIST_API_KEY`, `OMDB_API_KEY`)
- [x] Firestore security rules published (`firestore.rules`)
- [x] Firebase **Authorized domains** reviewed: `localhost`, the two Firebase domains and the Vercel domain: the right set
- [x] LICENSE (MIT), CI workflow, privacy note, platform rename and data migration
- [x] Browser API key restricted to the websites (item 1), Dependabot alerts enabled
- [x] Consent banner for EU/EEA/UK/CH, delete options and account deletion, full-page Settings, Marvel section

---

## 1. GitHub settings *(a few minutes)*

- [x] Dependabot alerts and security updates enabled (version updates are in `.github/dependabot.yml`)
- [ ] Settings → **Code security**: enable **Secret scanning** and **Push protection** if not already on.
- [ ] After the first CI run has finished on `main`: Settings → **Branches** → add a rule for
      `main` → **Require a pull request before merging** and **Require status checks to pass**
      → select **Lint, test, build**.
- [ ] Settings → General → under **Pull Requests**, tick **Automatically delete head branches**.

## 2. Check the live site after deploying

- [ ] **Discover loads** (titles and posters appear). If it's blank, open
      `https://cine-track-silk.vercel.app/api/tmdb?path=trending/all/week` in a tab: JSON means
      the function is fine; a "500 FUNCTION_INVOCATION_FAILED" page means it's crashing (check
      Vercel → project → Logs).
- [ ] **Ratings show** (IMDb / Rotten Tomatoes / Metacritic chips on Discover cards).
      `https://cine-track-silk.vercel.app/api/ratings?tmdb=27205&type=movie` should return JSON.
- [ ] **Google sign-in works** (popup). The Content-Security-Policy in `vercel.json` is strict. If
      sign-in fails, open DevTools → Console, look for "Refused to … Content Security Policy",
      and add that origin to `vercel.json` (or ask Claude).
- [ ] **After the PWA update (first deploy only):** installed copies and open tabs still run the old worker;
      one refresh (two on the very first load) moves them to the new version. If an install looks stuck,
      Settings → App & offline → *Clear offline cache & reload*.
- [ ] **Consent banner:** open the live site through a VPN in the EU/UK (or DevTools → Application → clear storage,
      then set `localStorage.cinetrack_region = '1'`): the banner should appear, nothing should load from
      googletagmanager until you click Allow. `https://cine-track-silk.vercel.app/api/region` should return your country.
- [ ] **Delete account (use a throw-away Google account):** Settings → Delete data → Delete account. Check in
      Firebase Console that the user is gone from Authentication and `users/{uid}/data/*` from Firestore.
- [ ] **iPhone home-screen app:** add the site to the Home Screen, open it, and sign in (it uses a redirect).
- [ ] **Two devices:** change different titles on a phone and a laptop at the same time; after a few
      seconds both should show both changes.
- [ ] **Android share:** install the app (Chrome → Install app), then in the IMDb app open a title →
      Share → CineTrack. The add dialog should open.
- [ ] **Letterboxd import:** Letterboxd → Settings → Data → **Export your data** → in CineTrack open
      Settings → Data → Import → choose the `.zip`.
- [ ] **Bookmarklet:** on a computer, open Settings → Quick add on the live site, drag **+ CineTrack**
      to the bookmarks bar, then click it on an IMDb page.
- [ ] **Old platform names:** a title you had marked Torrent or FTB should now show **Other**.
- [ ] **Phone check:** on an iPhone (or SE-sized screen) open Watchlist, Discover, a title's details,
      Settings and Analytics. Each Discover card should show exactly one Add/Edit button.

## 3. Later *(not urgent)*

### App Check (blocks scripts that reuse your Firebase config)

Deferred on purpose. The app already supports it: it turns on as soon as the site key is set.

1. Google Cloud Console → **reCAPTCHA** → Create key → type *Website*, add your domain(s) → copy the site key.
2. Firebase Console → **App Check** → Apps → your web app → **reCAPTCHA Enterprise** → paste the key → Save.
3. Add `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` in Vercel and `.env.local`; redeploy.
4. Local dev prints an App Check *debug token* in the browser console. Register it under
   App Check → ⋯ → **Manage debug tokens** (or put it in `VITE_APPCHECK_DEBUG_TOKEN`).
5. After a day or two of traffic shows as **Verified** in App Check → APIs, click **Enforce**
   for Cloud Firestore and Authentication.

### Other ideas

- [ ] **Language filter.** The home page filters by *country*. Language (e.g. Bengali vs Hindi,
      both India) needs a new field plus a lookup for existing titles; ask Claude if you want it.
- [ ] **AI features** (Groq): needs a server-side key with per-user limits; see the discussion in chat.

## Known and accepted (reviewed 2026-11-13)

- `npm audit` reports moderate issues in the PWA build tooling (`vite-plugin-pwa` → `workbox-build` →
  `deepmerge`, `glob`). They run at build time only and are not in the shipped app. The fix is a
  breaking `vite-plugin-pwa` upgrade; take it when a non-breaking release lands.
- Two `react-refresh/only-export-components` lint warnings (`button.tsx`, `StatusBadge.tsx`): the
  shadcn pattern of exporting a variants helper next to the component. Harmless.
- Major upgrades held back on purpose (React 19, Tailwind 4, ESLint 10, TypeScript 7): do them as a
  planned migration, not through Dependabot.
- Lists are capped at 1200 titles (one Firestore document). Needs sharding if anyone outgrows it.
