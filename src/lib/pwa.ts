import { useSyncExternalStore } from 'react';

/**
 * PWA plumbing: service-worker registration with an update prompt, the install prompt (Chromium /
 * Android) and online/offline state. The service worker only exists in production builds
 * (`npm run build && npm run preview` to try it); in dev everything here is inert.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  updateReady: boolean;      // a newer version is active; this tab should reload to use it
  canInstall: boolean;       // the browser offers a one-tap install
  installed: boolean;        // running as an installed app, or just installed
}

let state: PwaState = { updateReady: false, canInstall: false, installed: isStandalone() };
let installEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** True when launched from the home screen / app launcher rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

/** iPhone / iPad (including iPadOS, which reports itself as a Mac). */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Call once, before React renders: `beforeinstallprompt` can fire very early. */
export function setupPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();                       // keep it for our own Install button
    installEvent = e as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    set({ canInstall: false, installed: true });
  });

  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;

  // The new worker activates immediately (see vite.config.ts). A tab that was already controlled by
  // the previous version is now running old code against new files: ask it to reload.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) set({ updateReady: true }); });
  // A lazy-loaded chunk that no longer exists (a deploy happened while this tab was open) fails here.
  window.addEventListener('vite:preloadError', () => set({ updateReady: true }));

  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegisteredSW: (_url, registration) => {
        if (!registration) return;
        // Long-lived tabs and installed apps otherwise only look for a new version on a full reload.
        const check = () => { registration.update().catch(() => {}); };
        setInterval(check, 60 * 60 * 1000);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      },
    });
  });
}

/** Reloads into the new version. Unsaved text fields are lost, so this is always the user's call. */
export function reloadForUpdate(): void {
  window.location.reload();
}

/** Shows the browser's install dialog. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false;
  const event = installEvent;
  installEvent = null;                         // an event can be used once
  set({ canInstall: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') set({ installed: true });
  return outcome === 'accepted';
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const usePwa = (): PwaState => useSyncExternalStore(subscribe, () => state, () => state);

const onlineSubscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
};
export const useOnline = (): boolean => useSyncExternalStore(onlineSubscribe, () => navigator.onLine, () => true);

/**
 * Removes the service worker and its caches (offline copy, posters, cached API answers) and
 * reloads, so the next load fetches a clean copy. Does not touch the watchlist.
 */
export async function resetOfflineCache(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
  } catch { /* ignore */ }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch { /* ignore */ }
}
