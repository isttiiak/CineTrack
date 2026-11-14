import { tmdb } from './tmdb';
import { editDistance, freeText, normalize, parseQuery, typoBudget, type SearchFilter } from './search';
import type { TMDBItem } from '../hooks/useTMDBDiscover';

/**
 * Discover (TMDB) search, built for exploring rather than exact lookup:
 *  - relevance first (exact title > starts with > all words > typo match), then popularity
 *    within each tier, so "Dune" shows Dune (2021) before Dune (1984) and before "Dune Drifter";
 *  - typos: TMDB itself has no fuzzy search, so when a query finds little we retry with
 *    shortened words and keep only titles close to what was typed ("Showing results for …");
 *  - people: "nolan" shows Christopher Nolan's whole filmography (director/writer credits, or the
 *    main cast roles of an actor), as a group above the normal results;
 *  - studios and franchises: "marvel", "pixar", "a24", "star wars" show that studio's or collection's
 *    titles as a group. No AI involved: this is TMDB data we used to ignore;
 *  - filters from the watchlist syntax that make sense here: year:, type:/is:series|film, rating>.
 */

/** A themed set shown above the normal results: a person's work, a studio's titles or a franchise. */
export interface DiscoverGroup {
  id: string;
  title: string;                     // "Directed by Christopher Nolan"
  subtitle: string;                  // "12 titles"
  items: TMDBItem[];
}

export interface DiscoverResult {
  items: TMDBItem[];
  reasons: Record<number, string>;   // e.g. "Known for: Christopher Nolan"
  correctedTo?: string;              // set when results come from typo correction
  groups: DiscoverGroup[];
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

// ── Smart groups: people, studios, franchises ───────────────────────────────

const MIN_GROUP = 3;                 // a "group" of one or two titles is just noise
const MAX_GROUP = 60;

interface Credit extends RawItem { job?: string; character?: string; order?: number }
interface Credits { cast?: Credit[]; crew?: Credit[] }
export interface PersonHit { id: number; name: string; popularity?: number; known_for_department?: string }
export interface CompanyHit { id: number; name: string }
export interface CollectionHit { id: number; name: string }

/** Studios whose catalogue TMDB splits over several companies, so one search hit would miss most of it. */
const STUDIO_ALIASES: Record<string, { ids: number[]; label: string }> = {
  marvel: { ids: [420, 7505], label: 'Marvel' },                       // Marvel Studios + Marvel Entertainment (Spider-Man, X-Men…)
  mcu: { ids: [420, 7505], label: 'Marvel' },
  'marvel studios': { ids: [420, 7505], label: 'Marvel' },
  'marvel cinematic universe': { ids: [420, 7505], label: 'Marvel' },
};

const DIRECTING_JOBS = new Set(['Director', 'Creator']);
const WRITING_JOBS = new Set(['Writer', 'Screenplay', 'Story', 'Creator', 'Director']);
const TALK_NEWS_REALITY = new Set([10767, 10763, 10764]);
const PLAYS_THEMSELVES = /\b(self|himself|herself|themselves|narrator|host|presenter|archive footage)\b/i;

/** Every word typed starts a word of the name ("nolan" → "Christopher Nolan", "chris nol" too). */
export function nameMatchesQuery(query: string, name: string): boolean {
  const q = normalize(query).split(' ').filter(Boolean);
  const words = normalize(name).split(' ');
  return q.length > 0 && q.every((w) => words.some((x) => x.startsWith(w)));
}

/** The most popular person whose name matches what was typed. */
export function pickPerson(query: string, people: PersonHit[]): PersonHit | null {
  if (normalize(query).length < 3) return null;                 // "jo" is not a person
  const hits = people.filter((p) => typeof p?.name === 'string' && (p.popularity ?? 0) > 1 && nameMatchesQuery(query, p.name));
  return hits.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0] ?? null;
}

/**
 * A person leads the results when no title matches the query well, or the person is far better
 * known than the best title ("tom" must not hijack "Tom & Jerry"; "nolan" wins over "Nolan Ryan").
 */
export function personShouldLead(personPopularity: number, bestTitle: { tier: number; popularity: number } | null): boolean {
  if (!bestTitle || bestTitle.tier < 4) return true;
  return personPopularity >= 3 * bestTitle.popularity;
}

/** A person's work as titles: what they directed/wrote, or the main roles of an actor. Best known first. */
export function filmographyFrom(credits: Credits, department: string | undefined): RawItem[] {
  const picked: Credit[] = [];
  if (department === 'Directing' || department === 'Writing') {
    const jobs = department === 'Directing' ? DIRECTING_JOBS : WRITING_JOBS;
    // Shorts and student films have a handful of votes; the vote floor keeps the list to real work.
    picked.push(...(credits.crew ?? []).filter((c) => !!c.job && jobs.has(c.job) && (c.vote_count ?? 0) >= 100));
  } else {
    picked.push(...(credits.cast ?? []).filter((c) =>
      !PLAYS_THEMSELVES.test(c.character ?? '')
      && !(c.genre_ids ?? []).some((g) => TALK_NEWS_REALITY.has(g))
      && (c.vote_count ?? 0) >= 300
      && (c.order === undefined || c.order <= 12)));
  }
  const seen = new Set<string>();
  return picked
    .filter((c) => isTitle(c) && !seen.has(`${c.media_type}-${c.id}`) && (seen.add(`${c.media_type}-${c.id}`), true))
    .sort((a, b) => popularityScore(b) - popularityScore(a));
}

/** Production company ids for the query: a curated alias ("marvel"), else the exact or first name that starts with it. */
export function pickCompany(query: string, companies: CompanyHit[]): { ids: number[]; label: string } | null {
  const q = normalize(query);
  const alias = STUDIO_ALIASES[q];
  if (alias) return alias;
  const named = companies.filter((c) => typeof c?.name === 'string');       // tolerate unexpected payloads
  // TMDB often has several entries with the very same name (two "A24"s, one of them an empty stub): use them all.
  const exact = named.filter((c) => normalize(c.name) === q).slice(0, 4);
  if (exact.length) return { ids: exact.map((c) => c.id), label: exact[0].name };
  const hit = named.find((c) => normalize(c.name).startsWith(`${q} `));
  return hit ? { ids: [hit.id], label: hit.name } : null;
}

/**
 * The franchise whose name *is* the query ("star wars" → "Star Wars Collection", "avengers" → "The
 * Avengers Collection"). Exact only: a prefix would surface spin-offs ("Marvel Rising Collection"
 * for "marvel") and obscure series ("Tom Lepski Collection" for "tom").
 */
export function pickCollection(query: string, collections: CollectionHit[]): CollectionHit | null {
  const q = normalize(query).replace(/^the /, '');
  const base = (c: CollectionHit) => normalize(c.name).replace(/ collection$/, '').replace(/^the /, '');
  return collections.filter((c) => typeof c?.name === 'string').find((c) => base(c) === q) ?? null;
}

const countLabel = (n: number) => `${n} title${n === 1 ? '' : 's'}`;
const personTitle = (department: string | undefined, name: string) =>
  department === 'Directing' ? `Directed by ${name}` : department === 'Writing' ? `Written by ${name}` : `Starring ${name}`;

const isTitle = (i: RawItem) => (i.media_type === 'movie' || i.media_type === 'tv') && !!(i.title || i.name);

async function fetchSearch(text: string, kind: 'movie' | 'tv' | null, year: string | null, signal?: AbortSignal): Promise<RawItem[]> {
  const params: Record<string, string> = { query: text, language: 'en-US' };
  if (kind && year) params[kind === 'tv' ? 'first_air_date_year' : 'year'] = year;
  const data = await tmdb<{ results?: RawItem[] }>(kind ? `search/${kind}` : 'search/multi', params, signal);
  return (data.results ?? []).map((r) => (kind ? { ...r, media_type: kind } : r));
}

const withKind = (list: RawItem[] | undefined, kind: 'movie' | 'tv'): RawItem[] =>
  (list ?? []).map((r) => ({ ...r, media_type: kind })).filter((r) => r.title || r.name);

async function companyGroup(company: { ids: number[]; label: string }, signal?: AbortSignal): Promise<RawItem[]> {
  const base = { with_companies: company.ids.join('|'), sort_by: 'popularity.desc', 'vote_count.gte': '200', language: 'en-US' };
  const get = (kind: 'movie' | 'tv', page: string) =>
    tmdb<{ results?: RawItem[] }>(`discover/${kind}`, { ...base, page }, signal).then((d) => withKind(d.results, kind)).catch(() => [] as RawItem[]);
  const [m1, m2, tv] = await Promise.all([get('movie', '1'), get('movie', '2'), get('tv', '1')]);
  return [...m1, ...m2, ...tv].sort((a, b) => popularityScore(b) - popularityScore(a));
}

async function collectionGroup(c: CollectionHit, signal?: AbortSignal): Promise<RawItem[]> {
  const data = await tmdb<{ parts?: RawItem[] }>(`collection/${c.id}`, { language: 'en-US' }, signal).catch(() => ({ parts: [] as RawItem[] }));
  return withKind(data.parts, 'movie').sort((a, b) => (a.release_date ?? '9999').localeCompare(b.release_date ?? '9999'));
}

export async function searchDiscover(input: string, signal?: AbortSignal): Promise<DiscoverResult> {
  const q = parseQuery(input);
  const text = freeText(q);
  const reasons: Record<number, string> = {};
  if (!text) return { items: [], reasons, groups: [] };

  const typeFilter = q.filters.find((f) => f.key === 'type' || f.key === 'is');
  const kind = typeFilter ? (/^(series|show|shows|tv)$/.test(typeFilter.value) ? 'tv' : /^(film|films|movie|movies)$/.test(typeFilter.value) ? 'movie' : null) : null;
  const yearFilter = q.filters.find((f) => f.key === 'year' && f.op === ':' && /^\d{4}$/.test(f.value));
  const keep = (i: RawItem) => q.filters.every((f) => passes(f, i));

  // Studios and franchises are looked up in parallel with the title search (a short phrase only:
  // a sentence is never a studio name).
  const smart = normalize(text).length >= 3 && normalize(text).split(' ').length <= 4;
  const aliased = !!STUDIO_ALIASES[normalize(text)];
  const [raw, companyHits, collectionHits] = await Promise.all([
    fetchSearch(text, kind, yearFilter?.value ?? null, signal),
    smart && !aliased ? tmdb<{ results?: CompanyHit[] }>('search/company', { query: text }, signal).then((d) => d.results ?? []).catch(() => [] as CompanyHit[]) : Promise.resolve([] as CompanyHit[]),
    smart ? tmdb<{ results?: CollectionHit[] }>('search/collection', { query: text, language: 'en-US' }, signal).then((d) => d.results ?? []).catch(() => [] as CollectionHit[]) : Promise.resolve([] as CollectionHit[]),
  ]);

  const people = raw.filter((r) => r.media_type === ('person' as never) && (r.popularity ?? 0) > 1);
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

  // ── Groups ──
  const groups: DiscoverGroup[] = [];
  const shown = new Set<number>();
  const addGroup = (id: string, title: string, list: RawItem[], subtitle?: string) => {
    const fresh = list.filter(keep).filter((i) => !shown.has(i.id)).slice(0, MAX_GROUP);
    if (fresh.length < MIN_GROUP) return false;
    fresh.forEach((i) => shown.add(i.id));
    groups.push({ id, title, subtitle: subtitle ?? countLabel(fresh.length), items: fresh as TMDBItem[] });
    return true;
  };

  const person = pickPerson(text, people as PersonHit[]);
  const best = ranked[0];
  const lead = person && personShouldLead(person.popularity ?? 0, best ? { tier: relevanceTier(text, best), popularity: best.popularity ?? 0 } : null);
  const company = smart ? pickCompany(text, companyHits) : null;
  const collection = smart ? pickCollection(text, collectionHits) : null;

  const [credits, franchise, studio] = await Promise.all([
    person && lead ? tmdb<Credits>(`person/${person.id}/combined_credits`, { language: 'en-US' }, signal).catch(() => null) : null,
    collection ? collectionGroup(collection, signal) : null,
    company ? companyGroup(company, signal) : null,
  ]);

  let personShown = false;
  if (person && credits) personShown = addGroup(`person-${person.id}`, personTitle(person.known_for_department, person.name), filmographyFrom(credits, person.known_for_department));
  if (collection && franchise) addGroup(`collection-${collection.id}`, collection.name, franchise, `Franchise · ${franchise.length} films`);
  if (company && studio) addGroup(`company-${company.ids.join('-')}`, company.label === 'Marvel' ? 'Marvel' : `From ${company.label}`, studio, `Studio · most popular first`);

  // Old behaviour as a fallback: a person with no usable credits still lists what they're known for.
  const knownFor: RawItem[] = [];
  if (!personShown) {
    for (const p of people.slice(0, 2)) {
      for (const k of (p as unknown as RawItem).known_for ?? []) {
        if (!isTitle(k) || reasons[k.id]) continue;
        reasons[k.id] = `Known for: ${(p as unknown as RawItem).name}`;
        knownFor.push(k);
      }
    }
  }

  const rest = ranked.filter((t) => !shown.has(t.id));
  const listed = new Set(rest.map((t) => t.id));
  const fromPeople = knownFor.filter(keep).filter((k) => !listed.has(k.id) && !shown.has(k.id))
    .sort((a, b) => popularityScore(b) - popularityScore(a));
  const topPerson = Math.max(0, ...people.map((p) => p.popularity ?? 0));
  const topTitle = rest[0]?.popularity ?? 0;
  const peopleFirst = !rest.length || relevanceTier(text, rest[0]) < 2 || (fromPeople.length > 0 && topPerson >= 3 * topTitle);
  const items = peopleFirst ? [...fromPeople, ...rest] : [...rest, ...fromPeople];
  return { items: items.slice(0, 40) as TMDBItem[], reasons, correctedTo, groups };
}
