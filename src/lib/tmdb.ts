/**
 * Every TMDB request goes through our own /api/tmdb proxy (api/tmdb.ts in production, a Vite
 * middleware in dev), which adds the API key server-side so it never appears in the bundle.
 */
export async function tmdb<T = unknown>(path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams({ path, ...params });
  const res = await fetch(`/api/tmdb?${qs}`, { signal });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json() as Promise<T>;
}

export const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';
