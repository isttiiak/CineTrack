/**
 * Which host Firebase Auth uses for its sign-in helper pages (`/__/auth/*`).
 *
 * By default that is `<project>.firebaseapp.com`, a different site from the app. Safari 16.1+ (so every
 * iPhone) blocks the storage the redirect flow shares between the two, which is what loses the result
 * of a Google sign-in in the iOS home-screen app: you come back signed out, with no error. Firebase's
 * fix is to serve the helper from the app's own domain (a transparent proxy: vercel.json rewrites
 * `/__/auth/*` to firebaseapp.com) and use that domain as `authDomain`.
 *
 * It is switched on per deployment (`VITE_FIREBASE_AUTH_PROXY=true`, set where the rewrite and the
 * Google OAuth redirect URI exist) and only for the iOS home-screen app, the one place that needs it,
 * so every other browser keeps the sign-in that already works.
 */
export function chooseAuthDomain(o: { configured?: string; proxyEnabled: boolean; iosStandalone: boolean; host: string }): string | undefined {
  return o.proxyEnabled && o.iosStandalone && o.host ? o.host : o.configured;
}
