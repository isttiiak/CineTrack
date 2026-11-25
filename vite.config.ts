/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleTmdbRequest } from './api/_tmdb.ts';
import { handleRatingsRequest } from './api/_ratings.ts';
import { handleRegionRequest } from './api/_region.ts';
import { handleTopListRequest } from './api/_toplist.ts';
import { handleAiRequest } from './api/_ai.ts';

/** Serves the /api functions locally (dev + preview) with the same code Vercel runs. */
function apiRoutes(env: Record<string, string>): Plugin {
  const tmdbKey = env.TMDB_API_KEY || env.VITE_TMDB_API_KEY;
  const routes: Record<string, (r: Request) => Promise<Response>> = {
    '/api/tmdb': (r) => handleTmdbRequest(r, tmdbKey),
    '/api/ratings': (r) => handleRatingsRequest(r, { mdblist: env.MDBLIST_API_KEY, omdb: env.OMDB_API_KEY, tmdb: tmdbKey }),
    '/api/ai': (r) => handleAiRequest(r, {
      groqKey: env.GROQ_API_KEY, models: env.GROQ_MODEL?.split(',').map((m) => m.trim()).filter(Boolean),
      projectId: env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID,
      dailyLimit: parseInt(env.AI_DAILY_LIMIT ?? '', 10) || undefined,
    }),
    '/api/toplist': (r) => handleTopListRequest(r, { mdblist: env.MDBLIST_API_KEY, list: env.TOPLIST_IMDB250 }),
    '/api/region': async (r) => handleRegionRequest(r),   // dev: no country header, so the client falls back to the time zone
  };
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const pathname = req.url?.split('?')[0] ?? '';
    const handler = routes[pathname];
    if (!handler) return next();
    const hasBody = req.method === 'POST';
    const chunks: Buffer[] = [];
    if (hasBody) for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const response = await handler(new Request(new URL(req.url!, 'http://localhost'), {
      method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined,
    }));
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(await response.text());
  };
  return {
    name: 'cinetrack-api-routes',
    configureServer: (server) => { server.middlewares.use(middleware); },
    configurePreviewServer: (server) => { server.middlewares.use(middleware); },
  };
}

/**
 * Security headers live in vercel.json (one source of truth). `vite preview` serves them too, with the
 * same per-path rules, so the Content-Security-Policy can be tested locally against the production
 * build. The dev server doesn't get them: its HMR runtime needs inline scripts.
 */
function vercelHeaderRules(): { test: RegExp; headers: Record<string, string> }[] {
  const config = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'vercel.json'), 'utf8')) as {
    headers?: { source: string; headers: { key: string; value: string }[] }[];
  };
  return (config.headers ?? []).map((rule) => ({
    test: new RegExp(`^${rule.source}$`),         // vercel.json sources are regex-style paths
    headers: Object.fromEntries(rule.headers.map((h) => [h.key, h.value])),
  }));
}

function previewHeaders(): Plugin {
  const rules = vercelHeaderRules();
  return {
    name: 'cinetrack-preview-headers',
    configurePreviewServer: (server) => {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? '/';
        for (const rule of rules) if (rule.test.test(pathname)) for (const [k, v] of Object.entries(rule.headers)) res.setHeader(k, v);
        next();
      });
    },
  };
}

/**
 * Local mirror of the vercel.json rewrite of `/__/auth/*` to <project>.firebaseapp.com (Firebase's
 * sign-in helper pages, served from the app's own domain; see src/lib/authDomain.ts). Lets the
 * same-origin sign-in be tried with `npm run dev` / `npm run preview`. Does nothing unless the
 * configured auth domain is a firebaseapp.com / web.app host.
 */
function authHelperProxy(env: Record<string, string>): Plugin {
  const upstream = env.VITE_FIREBASE_AUTH_DOMAIN;
  const enabled = !!upstream && /\.(firebaseapp\.com|web\.app)$/.test(upstream);
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!enabled || !req.url?.startsWith('/__/auth/')) return next();
    const response = await fetch(`https://${upstream}${req.url}`, { method: req.method === 'POST' ? 'POST' : 'GET', redirect: 'manual' });
    res.statusCode = response.status;
    const type = response.headers.get('content-type');
    if (type) res.setHeader('content-type', type);
    res.end(Buffer.from(await response.arrayBuffer()));
  };
  return {
    name: 'cinetrack-auth-helper-proxy',
    configureServer: (server) => { server.middlewares.use(middleware); },
    configurePreviewServer: (server) => { server.middlewares.use(middleware); },
  };
}

const appVersion = (JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }).version;

export default defineConfig(({ mode }) => {
  // '' prefix: read server-only vars too. Nothing here is exposed to the client bundle.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: { __APP_VERSION__: JSON.stringify(appVersion) },
    plugins: [
      react(),
      previewHeaders(),                // before the proxy: the proxied helper pages get their headers too
      apiRoutes(env),
      authHelperProxy(env),
      VitePWA({
        // The new service worker takes over at once (skipWaiting + clientsClaim), so a plain refresh
        // always gives the newest version. Open tabs are *nudged* to reload, never reloaded under an
        // unsaved note (src/lib/pwa.ts). The worker only exists in a production build: to test the
        // PWA run `npm run build && npm run preview`.
        registerType: 'prompt',
        injectRegister: false,
        manifest: false,                     // public/manifest.json
        includeAssets: ['manifest.json', 'apple-touch-icon.png', 'icon-maskable-192.png', 'icon-maskable-512.png'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          // Never answer these navigations with the app shell: /api/* is the functions, and /__/* is Firebase's
          // sign-in helper (proxied from firebaseapp.com), whose pages must reach the network or sign-in breaks.
          navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          // Offline support beyond the app shell. Firestore traffic is never routed through here.
          runtimeCaching: [
            {
              // Posters. TMDB sends no CORS headers, so these are opaque (status 0); keep the cache small.
              urlPattern: ({ url }) => url.origin === 'https://image.tmdb.org',
              handler: 'CacheFirst',
              options: {
                cacheName: 'tmdb-images',
                expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-css', cacheableResponse: { statuses: [0, 200] } },
            },
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-files',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Title details / ratings: fresh when online, last known copy when offline or slow.
              urlPattern: ({ url, sameOrigin }) => sameOrigin && (url.pathname === '/api/tmdb' || url.pathname === '/api/ratings'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'cinetrack-api',
                networkTimeoutSeconds: 6,
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7, purgeOnQuotaError: true },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    build: {
      // Firebase is large by nature. Vendor chunks change rarely, so returning visitors re-download only app code.
      chunkSizeWarningLimit: 700,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/, priority: 20 },
              { name: 'motion', test: /node_modules[\\/]framer-motion[\\/]/, priority: 10 },
            ],
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    },
  };
});
