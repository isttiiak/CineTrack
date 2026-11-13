import { tmdb } from './tmdb';
import { editDistance, freeText, normalize, parseQuery, typoBudget, type SearchFilter } from './search';
import type { TMDBItem } from '../hooks/useTMDBDiscover';

/**
 * Discover (TMDB) search, built for exploring rather than exact lookup:
 *  - relevance first (exact title > starts with > all words > typo match), then popularity
 *    within each tier, so "Dune" shows Dune (2021) before Dune (1984) and before "Dune Drifter";
 *  - typos: TMDB itself has no fuzzy search, so when a query finds little we retry with
 *    shortened words and keep only titles close to what was typed ("Showing results for …");
 *  - people: searching "nolan" adds the titles that person is known for;
 *  - filters from the watchlist syntax that make sense here: year:, type:/is:series|film, rating>.
 */

export interface DiscoverResult {
  items: TMDBItem[];
  reasons: Record<number, string>;   // e.g. "Known for: Christopher Nolan"
  correctedTo?: string;              // set when results come from typo correction
}

interface RawItem extends TMDBItem { known_for?: RawItem[]; name?: string; popularity?: number; vote_count?: number; original_title?: string; original_name?: string }

const titleOf = (i: RawItem) => i.title ?? i.name ?? '';
const yearOf = (i: RawItem) => parseInt((i.release_date ?? i.first_air_date ?? '').slice(0, 4), 10);

/** 5 exact · 4 starts with · 3 every word is a title word · 2 every word starts a title word · 1 typo · 0 other. */
export function relevanceTier(query: string, item: Pick<RawItem, 'title' | 'name' | 'original_title' | 'original_name'>): number {
  const q = normalize(query);
  if (!q) return 0;
  const qWords = q.split(' ');
  let best = 0;
  for (const t of [item.title, item.name, item.original_title, item.original_name]) {
    if (!t) continue;
    const title = normalize(t);
    const words = title.split(' ');
    const compact = title.replace(/ /g, '');
    let tier = 0;
    if (title === q || compact === q.replace(/ /g, '')) tier = 5;
    else if (title.startsWith(q)) tier = 4;
    else if (qWords.every((w) => words.includes(w))) tier = 3;
    else if (qWords.every((w) => words.some((x) => x.startsWith(w)))) tier = 2;
    else if (qWords.every((w) => words.some((x) => {
      const budget = /\d/.test(w) ? 0 : typoBudget(w.length);
      return budget > 0 && (editDistance(w, x, budget) <= budget || (x.length > w.length && editDistance(w, x.slice(0, w.length), budget) <= budget));
    }))) tier = 1;
    best = Math.max(best, tier);
  }
  return best;
}

/** Popularity on a gentle log scale; vote count stops brand-new or obscure titles winning on hype alone. */
export const popularityScore = (i: { popularity?: number; vote_count?: number }) =>
  Math.log10(1 + (i.popularity ?? 0)) * 10 + Math.log10(1 + (i.vote_count ?? 0)) * 6;

export function rankItems(query: string, items: RawItem[]): RawItem[] {
  return items
    .map((item, idx) => ({ item, idx, tier: relevanceTier(query, item), pop: popularityScore(item) }))
    .sort((a, b) => b.tier - a.tier || b.pop - a.pop || a.idx - b.idx)
    .map((x) => x.item);
}

/** Shortened queries for typo recovery: "oppenhiemer" → "oppen"; "intersteller" → "inters". */
export function fallbackQueries(text: string): string[] {
  const words = normalize(text).split(' ').filter((w) => w.length >= 4 && !/\d/.test(w));
  const out = new Set<string>();
  const cut = (w: string) => w.slice(0, Math.max(3, Math.ceil(w.length * 0.5)));
  if (words[0]) out.add(cut(words[0]));
  const longest = [...words].sort((a, b) => b.length - a.length)[0];
  if (longest) out.add(cut(longest));
  return [...out].slice(0, 2);
}

function passes(f: SearchFilter, i: RawItem): boolean {
  const y = yearOf(i);
  switch (f.key) {
    case 'year': {
      const range = f.value.match(/^(\d{4})-(\d{4})$/);
      if (range) return y >= +range[1] && y <= +range[2];
      const v = parseInt(f.value, 10);
      if (!Number.isFinite(v)) return true;
      return f.op === '>' ? y > v : f.op === '<' ? y < v : f.op === '>=' ? y >= v : f.op === '<=' ? y <= v : y === v;
    }
    case 'type': case 'is': {
      if (/^(series|show|shows|tv)$/.test(f.value)) return i.media_type === 'tv';
      if (/^(film|films|movie|movies)$/.test(f.value)) return i.media_type === 'movie';
      return true;
    }
    case 'rating': {
      const v = parseFloat(f.value);
      const r = i.vote_average ?? 0;
      return !Number.isFinite(v) ? true : f.op === '<' ? r < v : f.op === '<=' ? r <= v : f.op === '>' ? r > v : r >= v;
    }
    default: return true;   // watchlist-only filters (status:, my>…) don't apply to Discover
  }
}

const isTitle = (i: RawItem) => (i.media_type === 'movie' || i.media_type === 'tv') && !!(i.title || i.name);

async function fetchSearch(text: string, kind: 'movie' | 'tv' | null, year: string | null, signal?: AbortSignal): Promise<RawItem[]> {
  const params: Record<string, string> = { query: text, language: 'en-US' };
  if (kind && year) params[kind === 'tv' ? 'first_air_date_year' : 'year'] = year;
  const data = await tmdb<{ results?: RawItem[] }>(kind ? `search/${kind}` : 'search/multi', params, signal);
  return (data.results ?? []).map((r) => (kind ? { ...r, media_type: kind } : r));
}

export async function searchDiscover(input: string, signal?: AbortSignal): Promise<DiscoverResult> {
  const q = parseQuery(input);
  const text = freeText(q);
  const reasons: Record<number, string> = {};
  if (!text) return { items: [], reasons };

  const typeFilter = q.filters.find((f) => f.key === 'type' || f.key === 'is');
  const kind = typeFilter ? (/^(series|show|shows|tv)$/.test(typeFilter.value) ? 'tv' : /^(film|films|movie|movies)$/.test(typeFilter.value) ? 'movie' : null) : null;
  const yearFilter = q.filters.find((f) => f.key === 'year' && f.op === ':' && /^\d{4}$/.test(f.value));
  const keep = (i: RawItem) => q.filters.every((f) => passes(f, i));

  const raw = await fetchSearch(text, kind, yearFilter?.value ?? null, signal);

  // People ("nolan", "zendaya") → the titles they're known for.
  const people = raw.filter((r) => r.media_type === ('person' as never) && (r.popularity ?? 0) > 1);
  const knownFor: RawItem[] = [];
  for (const p of people.slice(0, 2)) {
    for (const k of p.known_for ?? []) {
      if (!isTitle(k) || reasons[k.id]) continue;
      reasons[k.id] = `Known for: ${p.name}`;
      knownFor.push(k);
    }
  }

  let titles = raw.filter(isTitle).filter(keep);
  let correctedTo: string | undefined;

  // Few or weak matches → try shortened words, keep only close titles (typo recovery).
  const strong = titles.filter((t) => relevanceTier(text, t) >= 2).length;
  if (strong < 3 && normalize(text).length >= 4) {
    const extra = (await Promise.all(fallbackQueries(text).map((f) => fetchSearch(f, kind, null, signal).catch(() => [] as RawItem[]))))
      .flat().filter(isTitle).filter(keep).filter((t) => relevanceTier(text, t) >= 1);
    const seen = new Set(titles.map((t) => t.id));
    const added = extra.filter((t) => !seen.has(t.id) && (seen.add(t.id), true));
    if (added.length) {
      titles = [...titles, ...added];
      const top = rankItems(text, titles)[0];
      if (top && relevanceTier(text, top) === 1) correctedTo = titleOf(top);
    }
  }

  const ranked = rankItems(text, titles);
  const listed = new Set(ranked.map((t) => t.id));
  const fromPeople = knownFor.filter(keep).filter((k) => !listed.has(k.id))
    .sort((a, b) => popularityScore(b) - popularityScore(a));
  // A person search ("nolan") leads with their work when no title matches well, or when the
  // person is far more popular than the best-matching title ("Nolan Ryan - Feel the Heat").
  const topPerson = Math.max(0, ...people.map((p) => p.popularity ?? 0));
  const topTitle = ranked[0]?.popularity ?? 0;
  const peopleFirst = !ranked.length || relevanceTier(text, ranked[0]) < 2 || (fromPeople.length > 0 && topPerson >= 3 * topTitle);
  const items = peopleFirst ? [...fromPeople, ...ranked] : [...ranked, ...fromPeople];
  return { items: items.slice(0, 40) as TMDBItem[], reasons, correctedTo };
}
