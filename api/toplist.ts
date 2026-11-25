import { handleTopListRequest } from './_toplist.js';

declare const process: { env: Record<string, string | undefined> };

/** Vercel Function: GET /api/toplist — the IMDb Top 250, see api/_toplist.ts. */
export function GET(request: Request): Promise<Response> {
  return handleTopListRequest(request, { mdblist: process.env.MDBLIST_API_KEY, list: process.env.TOPLIST_IMDB250 });
}
