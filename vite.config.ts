/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleTmdbRequest } from './api/_tmdb.ts';
import { handleRatingsRequest } from './api/_ratings.ts';

/** Serves the /api functions locally (dev + preview) with the same code Vercel runs. */
function apiRoutes(env: Record<string, string>): Plugin {
  const tmdbKey = env.TMDB_API_KEY || env.VITE_TMDB_API_KEY;
  const routes: Record<string, (r: Request) => Promise<Response>> = {
    '/api/tmdb': (r) => handleTmdbRequest(r, tmdbKey),
    '/api/ratings': (r) => handleRatingsRequest(r, { mdblist: env.MDBLIST_API_KEY, omdb: env.OMDB_API_KEY, tmdb: tmdbKey }),
  };
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const pathname = req.url?.split('?')[0] ?? '';
    const handler = routes[pathname];
    if (!handler) return next();
    const response = await handler(new Request(new URL(req.url!, 'http://localhost'), { method: req.method }));
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
 * Security headers live in vercel.json (one source of truth). `vite preview` serves them too, so
 * the Content-Security-Policy can be tested locally against the production build. The dev server
 * doesn't get them: its HMR runtime needs inline scripts.
 */
function vercelHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'vercel.json'), 'utf8')) as {
    headers?: { source: string; headers: { key: string; value: string }[] }[];
  };
  const all = config.headers?.find((h) => h.source === '/(.*)')?.headers ?? [];
  return Object.fromEntries(all.map((h) => [h.key, h.value]));
}

export default defineConfig(({ mode }) => {
  // '' prefix: read server-only vars too. Nothing here is exposed to the client bundle.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      apiRoutes(env),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          navigateFallbackDenylist: [/^\/api\//],
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
    preview: {
      headers: vercelHeaders(),
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    },
  };
});
