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

/**
 * "Dune: Part Two (2024) - IMDb" / "Watch Dune | Netflix" / "‎Dune: Part Two (2024) directed by … • Letterboxd"
 * → "Dune: Part Two year:2024", ready for a Discover search.
 */
export function cleanPageTitle(title: string): string {
  let t = title.replace(/[\u200e\u200f]/g, '').trim();
  t = t.split(/\s+[|•·–—-]\s+(?=[^|•·–—-]*$)/)[0];            // drop " - IMDb", " | Netflix", " • Letterboxd"
  t = t.replace(/\s+directed by .*$/i, '').replace(/^(watch|stream)\s+/i, '').replace(/\s*\(TV (Mini )?Series.*?\)/i, ' ');
  const year = t.match(/\(((?:19|20)\d{2})\)/)?.[1];
  t = t.replace(/\s*\(((?:19|20)\d{2})\)\s*/, ' ').replace(/\s{2,}/g, ' ').trim();
  return year ? `${t} year:${year}` : t;
}

/** "https://letterboxd.com/film/dune-part-two/" → "dune part two". */
export function titleFromUrl(url: string): string | null {
  const lb = url.match(/letterboxd\.com\/film\/([a-z0-9-]+)/i);
  if (lb) return lb[1].replace(/-(19|20)\d{2}$/, '').replace(/-/g, ' ');
  return null;
}

/** Pulls the most useful text out of a Web Share Target / bookmarklet launch (?title=&text=&url=). */
export function sharedTextFrom(params: URLSearchParams): string | null {
  const parts = ['url', 'text', 'title'].map((k) => params.get(k)?.trim()).filter(Boolean) as string[];
  if (parts.length === 0) return null;
  // Apps often put the link inside `text` ("Check out Inception https://imdb.com/…").
  for (const p of parts) {
    const url = p.match(/https?:\/\/\S+/)?.[0];
    if (url && parseTitleLink(url)) return url;
  }
  const exact = parts.find((p) => parseTitleLink(p));
  if (exact) return exact;
  // Other sites: a readable slug from the URL, else the cleaned page title.
  for (const p of parts) {
    const fromUrl = titleFromUrl(p);
    if (fromUrl) return fromUrl;
  }
  const title = params.get('title')?.trim() || parts.find((p) => !/^https?:\/\//.test(p));
  return title ? cleanPageTitle(title).slice(0, 200) : null;
}
