import { handleRegionRequest } from './_region.js';

/** Vercel Function: GET /api/region — see api/_region.ts. */
export function GET(request: Request): Response {
  return handleRegionRequest(request);
}
