import { handleTmdbRequest } from './_tmdb.js';

declare const process: { env: Record<string, string | undefined> };

/** Vercel Function: GET /api/tmdb?path=<endpoint>&… — see api/_tmdb.ts. */
export function GET(request: Request): Promise<Response> {
  // VITE_TMDB_API_KEY is accepted only to ease migration; rename it to TMDB_API_KEY.
  return handleTmdbRequest(request, process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY);
}
