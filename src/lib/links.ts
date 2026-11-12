export type TitleLink =
  | { kind: 'imdb'; id: string }
  | { kind: 'tmdb'; type: 'movie' | 'tv'; id: number };

/**
 * Recognises a title link in pasted or shared text: an IMDb URL or bare id (tt0816692), or a
 * TMDB movie/TV URL. Returns null for anything else (plain titles are searched normally).
 */
export function parseTitleLink(text: string): TitleLink | null {
  const s = text.trim();
  if (!s) return null;
  const tmdb = s.match(/themoviedb\.org\/(movie|tv)\/(\d{1,10})/i);
  if (tmdb) return { kind: 'tmdb', type: tmdb[1].toLowerCase() as 'movie' | 'tv', id: parseInt(tmdb[2], 10) };
  const imdbUrl = s.match(/imdb\.com\/(?:[a-z]{2}\/)?title\/(tt\d{5,10})/i);
  if (imdbUrl) return { kind: 'imdb', id: imdbUrl[1].toLowerCase() };
  if (/^tt\d{5,10}$/i.test(s)) return { kind: 'imdb', id: s.toLowerCase() };
  return null;
}

/** Pulls the most useful text out of a Web Share Target launch (?title=&text=&url=). */
export function sharedTextFrom(params: URLSearchParams): string | null {
  const parts = ['url', 'text', 'title'].map((k) => params.get(k)?.trim()).filter(Boolean) as string[];
  if (parts.length === 0) return null;
  // Apps often put the link inside `text` ("Check out Inception https://imdb.com/…").
  for (const p of parts) {
    const url = p.match(/https?:\/\/\S+/)?.[0];
    if (url && parseTitleLink(url)) return url;
  }
  return parts.find((p) => parseTitleLink(p)) ?? parts[parts.length - 1].slice(0, 200);
}
