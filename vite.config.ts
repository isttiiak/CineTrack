/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleTmdbRequest } from './api/_tmdb.ts';

/** Serves /api/tmdb locally (dev + preview) with the same code the Vercel function runs. */
function tmdbProxy(credential: string | undefined): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/tmdb')) return next();
    const response = await handleTmdbRequest(
      new Request(new URL(req.url, 'http://localhost'), { method: req.method }),
      credential,
    );
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(await response.text());
  };
  return {
    name: 'cinetrack-tmdb-proxy',
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
      tmdbProxy(env.TMDB_API_KEY || env.VITE_TMDB_API_KEY),
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
    preview: {
      headers: vercelHeaders(),
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    },
  };
});
