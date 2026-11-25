import { initializeApp } from 'firebase/app';
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { chooseAuthDomain } from './authDomain';
import { isIosStandalone } from './pwa';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  // The iOS home-screen app signs in through the app's own domain (see lib/authDomain.ts).
  authDomain: chooseAuthDomain({
    configured: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    proxyEnabled: import.meta.env.VITE_FIREBASE_AUTH_PROXY === 'true',
    iosStandalone: isIosStandalone(),
    host: window.location.host,
  }),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);

// App Check proves requests come from this app, so scripts using the (public) Firebase config
// can't create accounts or write data directly. Optional: enabled when a site key is set.
// After it reports healthy traffic, turn on enforcement in Firebase Console → App Check.
const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
let appCheck: AppCheck | null = null;
if (appCheckSiteKey) {
  if (import.meta.env.DEV) {
    // Localhost can't pass reCAPTCHA; register the printed debug token in the console instead.
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

/**
 * A current App Check token, or null when App Check is off or the token can't be obtained. Sent to /api/ai,
 * which forwards it to Firestore (that call is made by the server, so it has no token of its own).
 */
export async function getAppCheckToken(): Promise<string | null> {
  if (!appCheck) return null;
  try { return (await getToken(appCheck)).token || null; } catch { return null; }
}

export const auth = getAuth(app);
// Firestore throws on `undefined` field values; ignore them instead of failing the whole write.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const googleProvider = new GoogleAuthProvider();
