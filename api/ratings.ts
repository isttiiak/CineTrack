import { handleRatingsRequest } from './_ratings.js';

declare const process: { env: Record<string, string | undefined> };

/** Vercel Function: GET /api/ratings?tmdb=<id>&type=movie|tv — see api/_ratings.ts. */
export function GET(request: Request): Promise<Response> {
  return handleRatingsRequest(request, {
    mdblist: process.env.MDBLIST_API_KEY,
    omdb: process.env.OMDB_API_KEY,
    tmdb: process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY,
  });
}
