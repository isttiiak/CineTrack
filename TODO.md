# Manual to-do

Tasks that need your accounts, dashboards or devices, so they can't be done from the code.
Do them roughly in this order and tick them off. Items marked *(optional)* can wait.

---

## 1. Rotate the TMDB key and move it server-side ⚠️ do first

Old deployments shipped the TMDB key inside the public JavaScript bundle, so treat it as leaked.

1. Go to <https://www.themoviedb.org/settings/api>. Regenerate the **API Key**, or create a new
   one, and copy it.
2. Vercel → your project → **Settings → Environment Variables**:
   - Add `TMDB_API_KEY` = the new key (Production, Preview and Development).
   - **Delete** `VITE_TMDB_API_KEY`.
3. Locally, in `.env.local`, rename `VITE_TMDB_API_KEY=` to `TMDB_API_KEY=` and paste the new key.
4. Redeploy (Vercel → Deployments → ⋯ → Redeploy) and check that Discover loads.

## 2. Turn on ratings from IMDb / Rotten Tomatoes / Metacritic / Letterboxd

1. Create a free account at <https://mdblist.com>, then go to **Preferences → API** and copy the key.
2. Add `MDBLIST_API_KEY` in Vercel (all environments) and in `.env.local`.
3. *(optional fallback)* Get a free key at <https://www.omdbapi.com/apikey.aspx> (confirm the
   email) and add it as `OMDB_API_KEY`.
4. Redeploy, open Discover, and check that IMDb / 🍅 / MC show under the posters.
   The free tiers allow about 1,000 requests a day for the whole app (cached), which is plenty
   for personal use.

## 3. Deploy the Firestore security rules

The repo's `firestore.rules` is stricter than what's probably live (size limits, no email in the profile).

- **Console:** Firebase Console → Firestore Database → **Rules** → paste the contents of
  `firestore.rules` → **Publish**.
- **Or CLI:** `npm i -g firebase-tools` → `firebase login` → `firebase use <your-project-id>` →
  `firebase deploy --only firestore:rules`.

Then sign in on the live site and change something to confirm saving still works (the sync
indicator should say "Synced").

## 4. Lock down the public Firebase config

The `VITE_FIREBASE_*` values are public by design. These settings stop other sites and scripts from using them.

1. **Authorized domains:** Firebase Console → Authentication → **Settings → Authorized domains** →
   keep only `localhost` and your real domain(s), e.g. `cine-track-silk.vercel.app`.
2. **Restrict the browser API key:** Google Cloud Console → APIs & Services → **Credentials** →
   the "Browser key (auto created by Firebase)":
   - Application restrictions → **Websites** → add `https://cine-track-silk.vercel.app/*`,
     `http://localhost:5173/*`, `http://localhost:4173/*` and any custom domain.
   - API restrictions → **Restrict key** → allow only Identity Toolkit API, Token Service API,
     Cloud Firestore API, Firebase Installations API, Firebase App Check API and (if used)
     Google Analytics / Firebase Management APIs.
   - Save, wait a few minutes, then test sign-in and sync on the live site.
3. **App Check** *(optional, recommended)*:
   1. Google Cloud Console → **reCAPTCHA** → Create key → type *Website*, add your domain(s) → copy the site key.
   2. Firebase Console → **App Check** → Apps → your web app → **reCAPTCHA Enterprise** → paste the key → Save.
   3. Add `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` in Vercel and `.env.local`; redeploy.
   4. Local dev prints an App Check *debug token* in the browser console. Register it under
      App Check → ⋯ → **Manage debug tokens** (or put it in `VITE_APPCHECK_DEBUG_TOKEN`).
   5. After a day or two of traffic shows as **Verified** in App Check → APIs, click **Enforce**
      for Cloud Firestore and Authentication.

## 5. Merge the branch and deploy

1. Open a pull request from `fix/audit-sync-import-layout` into `main` on GitHub
   (or ask Claude to create it).
2. Check the Vercel preview deployment (step 6 below), then merge. Vercel deploys `main` automatically.

## 6. Check on the live site after deploying

- [ ] **Google sign-in works** (popup). The new Content-Security-Policy is strict. If sign-in fails, open
      DevTools → Console, look for "Refused to … because it violates the Content Security Policy",
      and add that origin to `vercel.json` (or ask Claude). If your
      `VITE_FIREBASE_AUTH_DOMAIN` isn't `*.firebaseapp.com`, add it to `frame-src`.
- [ ] **iPhone home-screen app:** add the site to the Home Screen, open it, and sign in (it uses a redirect).
- [ ] **Two devices:** change different titles on a phone and a laptop at the same time; after a few
      seconds both should show both changes.
- [ ] **Functions:** `https://<your-domain>/api/tmdb?path=trending/all/week` returns JSON, and
      `/api/ratings?tmdb=27205&type=movie` returns ratings (or a 503 if no ratings key yet).
- [ ] **Android share:** install the app (Chrome → Install app), then in the IMDb app open a title →
      Share → CineTrack. The add dialog should open.
- [ ] **Letterboxd import:** Letterboxd → Settings → Data → **Export your data** → in CineTrack open
      Settings → Import → choose the `.zip`.

## 7. Open-source housekeeping *(optional)*

- [ ] **Add a LICENSE file.** The README says MIT, but there's no license file. On GitHub: Add file →
      Create new file → name it `LICENSE` → **Choose a license template** → MIT → commit.
- [ ] **GitHub security features:** Settings → Code security → enable **Dependabot alerts**,
      **Dependabot security updates**, **Secret scanning** and **Push protection**.
- [ ] **Branch protection** for `main`: Settings → Branches → require a pull request before merging.
- [ ] **CI:** ask Claude to add a GitHub Actions workflow that runs `npm ci`, `npm run lint`,
      `npm test` and `npm run build` on every pull request.

## 8. Decisions for you *(optional)*

- [ ] **Platform names:** "Torrent" and "FTB" in the platform list may look bad in a public
      open-source app. Consider renaming them to "Other / personal link" (ask Claude; existing data
      would need a small migration).
- [ ] **Analytics & privacy:** if you set `VITE_FIREBASE_MEASUREMENT_ID` and have EU visitors, add a
      short privacy note (what's collected: anonymous usage events only) and consider a consent banner.
- [ ] **AI features (Groq):** smart add from free text, mood search, "what should I watch tonight".
      Needs a server-side key with per-user limits; ask Claude when ready.
