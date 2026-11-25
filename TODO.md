# Manual to-do

Tasks that need your accounts, dashboards or devices, so they can't be done from the code, plus a short list of feature ideas
and follow-ups. Tick them off as you go. Items marked *(optional)* can wait.

*Last tidied 2026-11-25. Ticks marked "checked through the API" were verified from the outside; the rest are as reported.*

## Done

- [x] TMDB key rotated and moved server-side (`TMDB_API_KEY`, no `VITE_` prefix)
- [x] Ratings keys added (`MDBLIST_API_KEY`, `OMDB_API_KEY`)
- [x] Firestore security rules published (`firestore.rules`)
- [x] Firebase **Authorized domains** reviewed: `localhost`, the two Firebase domains and the Vercel domain: the right set
- [x] LICENSE (MIT), CI workflow, privacy note, platform rename and data migration
- [x] Browser API key restricted to the websites (item 1), Dependabot alerts enabled
- [x] Consent banner for EU/EEA/UK/CH, delete options and account deletion, full-page Settings, Marvel section
- [x] iPhone home-screen Google sign-in (same-origin auth helper: redirect URI added, `VITE_FIREBASE_AUTH_PROXY=true`; v1.3.1)
- [x] **AI features (Groq)** shipped in v1.3.0: Ask AI, list filter, Tonight, taste summary, Read with AI; shared key with a daily allowance, or your own key
- [x] Groq key created and `GROQ_API_KEY` set in Vercel (the live `/api/ai` answers "sign in", not "not configured")
- [x] Updated `firestore.rules` (including the AI usage counter) published; Ask AI tested while signed in

---

## 1. GitHub settings *(a few minutes)*

- [x] Dependabot alerts and security updates enabled (version updates are in `.github/dependabot.yml`)
- [x] **Secret scanning** and **Push protection** are on (checked through the GitHub API)
- [ ] After the first CI run has finished on `main`: Settings → **Branches** → add a rule for
      `main` → **Require a pull request before merging** and **Require status checks to pass**
      → select **Lint, test, build**.
- [ ] Settings → General → under **Pull Requests**, tick **Automatically delete head branches**.

## 2. AI search setup *(needed before the Ask AI button works)*

- [x] Create a free key at <https://console.groq.com/keys>.
- [x] Vercel → Project → Settings → Environment Variables: add `GROQ_API_KEY` (all environments), redeploy.
      Optional: `GROQ_MODEL` (comma separated, tried in order; default `openai/gpt-oss-20b,qwen/qwen3.8-27b`.
      Groq retires models without much notice: if Ask AI says "unavailable", check the Vercel function logs for
      `AI search: <model> answered 404` and update this list from console.groq.com/docs/models) and
      `AI_DAILY_LIMIT` (default 20 per user per UTC day, the rules cap it at 100). For local testing put the same in `.env.local`.
- [x] **Publish the updated `firestore.rules`** (Firebase Console → Firestore → Rules, or `firebase deploy --only firestore:rules`).
      Without it, Ask AI answers "unavailable" (the usage counter can't be written).
- [x] Test while signed in: Discover → type "scary korean movies from the 2010s" → **Ask AI**. You should see
      "Korean horror films…" with chips and "19 of 20 AI searches left today". Try the same query again: no allowance is used.
- [ ] Settings → AI: paste your own Groq key → **Save key** (it is checked against Groq), choose a model, press **Test AI**.
      Then try each feature without signing in: Discover → Ask AI; the ✨ in the watchlist search box ("comedies i haven't
      watched"); the Tonight button; Analytics → "Write it" (needs 3+ watched titles); Settings → Import → "Paste a list" →
      "Read with AI". Remove the key afterwards to confirm the buttons fall back to "Sign in or add your own key".
- [ ] Check the Groq console for usage; if you hit the free tier's limits, users see "AI search is busy" and the regular search still works.

## 3. Check the live site after deploying

- [x] **Discover loads** (titles and posters appear). If it's blank, open
      `https://cine-track-silk.vercel.app/api/tmdb?path=trending/all/week` in a tab: JSON means
      the function is fine; a "500 FUNCTION_INVOCATION_FAILED" page means it's crashing (check
      Vercel → project → Logs).
- [x] **Ratings show** (IMDb / Rotten Tomatoes / Metacritic chips on Discover cards).
      `https://cine-track-silk.vercel.app/api/ratings?tmdb=27205&type=movie` should return JSON.
- [x] **Google sign-in works** (popup). The Content-Security-Policy in `vercel.json` is strict. If
      sign-in fails, open DevTools → Console, look for "Refused to … Content Security Policy",
      and add that origin to `vercel.json` (or ask Claude).
- [x] **After the PWA update (first deploy only):** installed copies and open tabs still run the old worker;
      one refresh (two on the very first load) moves them to the new version. If an install looks stuck,
      Settings → App & offline → *Clear offline cache & reload*.
- [x] **Consent banner:** open the live site through a VPN in the EU/UK (or DevTools → Application → clear storage,
      then set `localStorage.cinetrack_region = '1'`): the banner should appear, nothing should load from
      googletagmanager until you click Allow. `https://cine-track-silk.vercel.app/api/region` should return your country.
- [x] **Delete account (use a throw-away Google account):** Settings → Delete data → Delete account. Check in
      Firebase Console that the user is gone from Authentication and `users/{uid}/data/*` from Firestore.
- [x] **iPhone home-screen app:** add the site to the Home Screen, open it, and sign in (it uses a redirect).
- [x] **Two devices:** change different titles on a phone and a laptop at the same time; after a few
      seconds both should show both changes.
- [ ] **Android share:** install the app (Chrome → Install app), then in the IMDb app open a title →
      Share → CineTrack. The add dialog should open.
- [ ] **Letterboxd import:** Letterboxd → Settings → Data → **Export your data** → in CineTrack open
      Settings → Data → Import → choose the `.zip`.
- [x] **Bookmarklet:** on a computer, open Settings → Quick add on the live site, drag **+ CineTrack**
      to the bookmarks bar, then click it on an IMDb page.
- [x] **Old platform names:** a title you had marked Torrent or FTB should now show **Other**.
- [x] **Phone check:** on an iPhone (or SE-sized screen) open Watchlist, Discover, a title's details,
      Settings and Analytics. Each Discover card should show exactly one Add/Edit button.

## 4. Later *(not urgent)*

### App Check (blocks scripts that reuse your Firebase config)

**What it does:** without it, anyone can copy the public Firebase config from the site and talk to Firestore/Auth
from a script (every request still needs a signed-in user and passes the security rules, but they can create accounts and
burn quota). With App Check enforced, Firebase refuses requests that don't carry a token only the real app can get.

**What the code already does** (nothing to change in code, it switches on with the site key):
- `src/lib/firebase.ts` starts App Check with reCAPTCHA Enterprise when `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` is set. The Firebase SDK
  then attaches the token to every Firestore and Auth request by itself.
- **The shared-key AI path** (`/api/ai`) reads and writes your usage counter in Firestore from the server. A server has no
  App Check token, so enforcing Firestore would have broken it. Fix: the browser sends its App Check token to `/api/ai`
  (header `X-Firebase-AppCheck`) and the server forwards it, unchanged, to Firestore on those two calls. Quota,
  sign-in and rules are exactly as before (20 a day, charged only after the model answered, own-key path untouched,
  "Delete account" still deletes the counter). Bonus: with Firestore enforced, a script can no longer use your shared
  Groq key either, because it has no App Check token. If the token is missing, Ask AI (shared key) says "unavailable" and
  everything else is unaffected.
- The CSP in `vercel.json` already allows reCAPTCHA (`script-src` google.com/recaptcha + gstatic.com/recaptcha, `frame-src`
  google.com/recaptcha + recaptcha.google.com, `connect-src` `*.googleapis.com` for firebaseappcheck.googleapis.com).
  Still, check it once in a real browser (step 6).

**Alternatives that were considered** (why they were not chosen): (a) *Firebase Admin SDK with a service-account key* to verify
ID tokens and write the counter: then Firestore rules can make the counter server-only (a real quota instead of a guard),
but it adds a powerful secret to Vercel (a service-account JSON with admin rights on your whole project), a heavy
dependency and slower cold starts, and the Admin SDK bypasses rules. Worth doing only if quota abuse becomes real.
(b) *Counter in another store* (Vercel KV / Upstash): a new service and account, and "Delete account" would have to call the server.
(c) *Leave Firestore unenforced and enforce only Authentication*: leaves the data path open, which is the main thing to protect.

**Steps (all in dashboards; takes about 30 minutes plus a few days of watching):**

1. **Create the key.** Google Cloud Console (project `cinetrack-da621`) → search **reCAPTCHA** → *Create key* → Display name `CineTrack web`
   → Platform **Website** → add your **real domains only** (the Vercel domain and any custom one; **do not add `localhost`**)
   → keep it **score-based** (leave *Use checkbox challenge* unticked) → Create → copy the **site key** (the public one).
   (If the page asks to enable the *reCAPTCHA Enterprise API*, click Enable.)
2. **Register the app.** Firebase Console → **Build/Security → App Check** → **Apps** tab → your web app → **reCAPTCHA** (Enterprise)
   → paste the site key → *Save*. Leave the token lifetime at the default (1 hour).
3. **Give the site to the app.** Vercel → Project → Settings → Environment Variables → add `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` = the site key
   (Production and Preview) → Redeploy. For local dev put the same in `.env.local`.
4. **Local development.** `npm run dev` prints `AppCheck debug token: "…"` in the browser console. Firebase Console → App Check → Apps →
   ⋯ next to the web app → **Manage debug tokens** → Add → paste. (Or put a token you created there in `.env.local` as
   `VITE_APPCHECK_DEBUG_TOKEN`.) Never add `localhost` to the reCAPTCHA key instead.
5. **Monitor mode first (nothing is blocked yet).** Firebase Console → App Check → **APIs** → **Cloud Firestore** (and *Authentication*)
   shows requests as *Verified*, *Outdated client* (no token), *Unknown origin* and *Invalid*. Use the live site normally for
   **2 to 3 days** on every kind of device and make sure each one shows up as Verified:
   - [ ] desktop Chrome / Firefox, signed in, edit a title (Firestore verified rises)
   - [ ] Safari on Mac
   - [ ] Android Chrome (and the installed PWA)
   - [ ] **iPhone home-screen app** (signs in through the `/__/auth` proxy): sign out, sign in, edit a title
   - [ ] **Ask AI with the shared key** (Discover → Ask AI, signed in, no own key): this proves the forwarded token is accepted
         by Firestore's REST API. Check the Firestore metrics: those calls must count as *Verified*. If they show as
         *Outdated client*, do **not** enforce Firestore (tell Claude: the fallback is the Admin SDK option above).
   - [ ] delete-account on a throw-away account still works
6. **Browser check of the CSP.** Open the live site with DevTools → Console open: no `Refused to … Content Security Policy`
   lines mentioning google.com/recaptcha, gstatic.com/recaptcha or firebaseappcheck.googleapis.com. (`npm run build && npm run preview`
   serves the same headers locally, with the debug token registered.)
7. **Enforce, one product at a time, Firestore first.** When almost all requests show as *Verified* (the few left should be
   "Unknown origin" scripts, which is the point): App Check → APIs → **Cloud Firestore → Enforce**. It takes up to ~15 minutes.
   Right away: sign in, edit a title, reload on a phone; Ask AI with the shared key. Wait a day.
8. **Authentication is optional and last.** Google sign-in is the only method, so the gain is small, and (not verified)
   Firebase may ask to upgrade to *Identity Platform* for it. If you enforce it, test the iPhone home-screen sign-in again right after.

**Rollback (instant, no deploy):** Firebase Console → App Check → APIs → the product → **Unenforce**. Takes effect within
~15 minutes. Users who were blocked just need a reload. Removing `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` and redeploying turns the client side off
too (only do that after unenforcing, otherwise enforced requests would all fail).

**If a user group is locked out after enforcing** (typical: very old browsers, privacy extensions that block reCAPTCHA, school/work
networks that block google.com/recaptcha): the app can't reach Firestore for them and the list stays local on that device (nothing is lost;
it syncs once they can verify). Unenforce, then look at the *Invalid* numbers per platform before trying again.

### Ideas, in rough order of value

- [ ] **Ask about this title.** An AI chat in the details drawer, grounded in the TMDB synopsis, cast and your own notes/rating
      (so it can't invent plot details). Same two ways to be served as the other AI features (own key / shared allowance), one click per question.
- [ ] **"Why you'd like this" one-liners on For you.** Today each pick says "Because you liked X". A short AI sentence that ties the
      title to your taste stats (aggregate only, as the Taste summary does), generated on click or for the first few picks.
- [ ] **Language filter.** The home page filters by *country*. Language (e.g. Bengali vs Hindi,
      both India) needs a new field plus a lookup for existing titles; ask Claude if you want it.

### Follow-ups from the App Check and Discover work

- [ ] **Turn App Check enforcement on** (section above): monitor, check every platform, enforce Firestore, optionally Authentication.
      Nothing else changes in the code. If Firestore rejects the forwarded token for Ask AI, move the quota counter to the Admin SDK.
- [ ] *(optional)* **Make the AI quota a real limit.** Today a user can delete their own counter document (needed for "Delete account"), so
      20 a day is a guard, not a vault. The Admin SDK route (service-account secret, rules making the counter server-only) fixes that.
- [ ] **Discover on a real phone.** Scrolling through the new long lists was checked in a phone-sized desktop window only. Try
      Trending / Movies / Coming soon on an iPhone and an Android phone: smooth scrolling, nothing jumping, *Load more* reachable.
      The lists are now windowed (only rows near the screen are rendered), so also watch for blank gaps during a fast fling and for rows
      shifting when ratings load.
- [ ] **Watch the ratings quota** (MDBList ~1000 requests a day for everyone). Cards now fetch ratings only after half a second in view, but longer
      scrolling means more titles seen. If "ratings unavailable" starts showing up, batch the lookups or lower the cap.
- [ ] **Remember the era** (New / Last 5 years / All time) per tab between visits; today it resets on reload.

## Known and accepted (reviewed 2026-11-13)

- `npm audit` reports moderate issues in the PWA build tooling (`vite-plugin-pwa` → `workbox-build` →
  `deepmerge`, `glob`). They run at build time only and are not in the shipped app. The fix is a
  breaking `vite-plugin-pwa` upgrade; take it when a non-breaking release lands.
- Two `react-refresh/only-export-components` lint warnings (`button.tsx`, `StatusBadge.tsx`): the
  shadcn pattern of exporting a variants helper next to the component. Harmless.
- Major upgrades held back on purpose (React 19, Tailwind 4, ESLint 10, TypeScript 7): do them as a
  planned migration, not through Dependabot.
- Lists are capped at 1200 titles (one Firestore document). Needs sharding if anyone outgrows it.
