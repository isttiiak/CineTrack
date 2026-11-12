import type { MovieEntry, WatchMeta, WatchStatus } from '../types';

/**
 * Watchlist search.
 *
 * Free text: every word must match somewhere (title, genre, country, section, platform, year,
 * notes). Matching ignores case, accents and punctuation ("shogun" finds "Shōgun", "spiderman"
 * finds "Spider-Man") and tolerates small typos ("oppenhiemer"). Results are ranked: exact title,
 * then title prefix, then word matches in the title, then other fields.
 *
 * Filters (combine freely with text):
 *   year:2024  year:2010-2019  year>2015      status:watched (plan / watching / watched)
 *   type:series  type:film                     is:watched  is:series  is:rated  is:unrated
 *   genre:drama  country:korea  section:nolan  platform:netflix
 *   rating>8  (IMDb/TMDB score)                my>=7  (your rating)
 *   has:notes  has:link  has:date              "exact phrase"
 */

export type Op = ':' | '>' | '<' | '>=' | '<=';
export interface SearchFilter { key: string; op: Op; value: string }
export interface ParsedQuery { terms: string[]; phrases: string[]; filters: SearchFilter[]; hasCriteria: boolean }

const KEY_ALIASES: Record<string, string> = {
  y: 'year', year: 'year',
  s: 'status', status: 'status',
  t: 'type', type: 'type',
  g: 'genre', genre: 'genre',
  c: 'country', country: 'country',
  sec: 'section', section: 'section',
  p: 'platform', platform: 'platform', on: 'platform',
  r: 'rating', rating: 'rating', imdb: 'rating', score: 'rating',
  my: 'my', mine: 'my', myrating: 'my',
  is: 'is', has: 'has',
};

/** Lowercase, no accents, '&' → 'and', punctuation → single spaces. */
export function normalize(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function parseQuery(input: string): ParsedQuery {
  const filters: SearchFilter[] = [];
  const phrases: string[] = [];
  let rest = input.replace(/"([^"]+)"/g, (_, p: string) => { const n = normalize(p); if (n) phrases.push(n); return ' '; });
  rest = rest.replace(/(?:^|\s)([a-z]+)(:|>=|<=|>|<)("?)([^\s"]+)\3/gi, (whole, k: string, op: Op, _q, v: string) => {
    const key = KEY_ALIASES[k.toLowerCase()];
    if (!key) return whole;            // not a known filter — keep it as text (e.g. "Mission: Impossible")
    filters.push({ key, op, value: v.toLowerCase() });
    return ' ';
  });
  const terms = normalize(rest).split(' ').filter(Boolean);
  return { terms, phrases, filters, hasCriteria: terms.length + phrases.length + filters.length > 0 };
}

/** Damerau–Levenshtein distance, capped (returns max+1 as soon as it's exceeded). */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Typos allowed for a word of this length: none for short words, 1 from 4 letters, 2 from 8. */
export const typoBudget = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

function fuzzyWord(term: string, words: string[]): boolean {
  const budget = typoBudget(term.length);
  if (!budget || /\d/.test(term)) return false;   // "2021" must not match "2024"

  return words.some((w) => w.length >= 3 && (editDistance(term, w, budget) <= budget
    // typo inside a longer word being typed: compare against the word's start
    || (w.length > term.length && editDistance(term, w.slice(0, term.length), budget) <= budget)));
}

const STATUS_WORDS: Record<string, WatchStatus> = {
  plan: 'plan', planned: 'plan', towatch: 'plan', later: 'plan', queue: 'plan',
  watching: 'watching', progress: 'watching', inprogress: 'watching', current: 'watching',
  watched: 'watched', seen: 'watched', done: 'watched', finished: 'watched',
};
const TYPE_WORDS: Record<string, 'Film' | 'Series'> = {
  film: 'Film', films: 'Film', movie: 'Film', movies: 'Film',
  series: 'Series', show: 'Series', shows: 'Series', tv: 'Series',
};

function compareNum(n: number, op: Op, raw: string): boolean {
  const range = raw.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (range && op === ':') return n >= parseFloat(range[1]) && n <= parseFloat(range[2]);
  const v = parseFloat(raw);
  if (!Number.isFinite(v) || !Number.isFinite(n)) return false;
  switch (op) {
    case '>': return n > v;
    case '<': return n < v;
    case '>=': return n >= v;
    case '<=': return n <= v;
    default: return n === v;
  }
}

const textHas = (field: string | undefined, value: string) => !!field && normalize(field).includes(normalize(value));

function passesFilter(f: SearchFilter, e: MovieEntry, m: WatchMeta | undefined): boolean {
  const status = m?.status ?? 'plan';
  switch (f.key) {
    case 'year': return compareNum(parseInt(e.year, 10), f.op, f.value);
    case 'status': return STATUS_WORDS[f.value.replace(/[^a-z]/g, '')] === status;
    case 'type': return TYPE_WORDS[f.value] === e.type;
    case 'genre': return textHas(e.genre, f.value);
    case 'country': return textHas(e.country, f.value);
    case 'section': return textHas(e.section, f.value);
    case 'platform': return textHas(m?.watchPlatform, f.value);
    case 'rating': return compareNum(parseFloat(e.imdbRating), f.op === ':' ? '>=' : f.op, f.value);
    case 'my': return m?.personalRating != null && compareNum(m.personalRating, f.op === ':' ? '>=' : f.op, f.value);
    case 'is': {
      const w = f.value.replace(/[^a-z]/g, '');
      if (STATUS_WORDS[w]) return STATUS_WORDS[w] === status;
      if (TYPE_WORDS[w]) return TYPE_WORDS[w] === e.type;
      if (w === 'rated') return m?.personalRating != null;
      if (w === 'unrated') return m?.personalRating == null;
      return false;
    }
    case 'has': {
      if (/^notes?$/.test(f.value)) return !!m?.notes;
      if (/^links?$/.test(f.value)) return !!m?.watchLink;
      if (/^dates?$|^watchedon$/.test(f.value)) return !!m?.watchedOn;
      if (/^posters?$/.test(f.value)) return !!e.posterUrl;
      if (/^progress$/.test(f.value)) return m?.progressEpisode != null;
      return false;
    }
    default: return true;
  }
}

/**
 * Relevance score for one entry, or null when it doesn't match. With no free text, every entry
 * that passes the filters scores 0 (so the chosen sort order applies).
 */
export function scoreEntry(q: ParsedQuery, e: MovieEntry, m: WatchMeta | undefined): number | null {
  for (const f of q.filters) if (!passesFilter(f, e, m)) return null;
  if (q.terms.length === 0 && q.phrases.length === 0) return 0;

  const title = normalize(e.title);
  const titleWords = title.split(' ');
  const titleCompact = title.replace(/ /g, '');
  // Type and status words are searchable too: "korean series", "watched nolan".
  const typeWords = e.type === 'Series' ? 'series show tv' : 'film movie';
  const statusWords = { plan: 'plan to watch planned', watching: 'watching', watched: 'watched seen' }[m?.status ?? 'plan'];
  const other = normalize([e.genre, e.country, e.section, m?.watchPlatform, e.year, typeWords, statusWords].filter(Boolean).join(' '));
  const otherWords = other.split(' ');
  const notes = m?.notes ? normalize(m.notes) : '';

  let score = 0;
  for (const p of q.phrases) {
    if (title.includes(p)) score += 40;
    else if (other.includes(p) || notes.includes(p)) score += 10;
    else return null;
  }
  for (const t of q.terms) {
    if (titleWords.includes(t)) score += 30;
    else if (titleWords.some((w) => w.startsWith(t))) score += 22;
    else if (titleCompact.includes(t)) score += 15;          // "spiderman" in "spider man"
    else if (otherWords.includes(t) || otherWords.some((w) => w.startsWith(t))) score += 8;
    else if (other.includes(t)) score += 5;
    else if (fuzzyWord(t, titleWords)) score += 10;
    else if (notes && (notes.split(' ').some((w) => w.startsWith(t)) || notes.includes(t))) score += 3;
    else if (fuzzyWord(t, otherWords)) score += 2;
    else return null;
  }

  // Whole-query bonuses: an exact title should always come first.
  const whole = q.terms.join(' ');
  if (whole) {
    if (title === whole || titleCompact === whole.replace(/ /g, '')) score += 100;
    else if (title.startsWith(whole)) score += 40;
    else if (title.includes(whole)) score += 20;
    else {
      // A typo in the whole title ("dnue" → "Dune") still beats a partial match.
      const budget = typoBudget(whole.length);
      if (budget && !/\d/.test(whole) && editDistance(whole.replace(/ /g, ''), titleCompact, budget) <= budget) score += 60;
    }
  }
  return score;
}

/** Filters and ranks entries; stable for equal scores (keeps the incoming order). */
export function searchEntries(entries: MovieEntry[], meta: Record<string, WatchMeta>, q: ParsedQuery): { entry: MovieEntry; score: number }[] {
  const out: { entry: MovieEntry; score: number; i: number }[] = [];
  entries.forEach((entry, i) => {
    const score = scoreEntry(q, entry, meta[entry.id]);
    if (score !== null) out.push({ entry, score, i });
  });
  return out;
}

/** Splits text into plain/highlighted parts for the query's words (accent- and case-insensitive). */
export function highlightParts(text: string, q: ParsedQuery): { text: string; hit: boolean }[] {
  const needles = [...q.phrases, ...q.terms].filter((t) => t.length >= 2);
  if (needles.length === 0) return [{ text, hit: false }];
  // Normalise char by char, remembering where each normalised char came from.
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i].normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const n = /[\p{L}\p{N}]/u.test(c) ? c : ' ';
    for (const ch of n) { norm += ch; map.push(i); }
  }
  const marks = new Array(text.length).fill(false);
  for (const needle of needles) {
    const pattern = needle.replace(/ /g, '');
    // Match ignoring spaces in the text too ("spiderman" ↔ "Spider-Man").
    const compact: number[] = [];
    let compactStr = '';
    for (let i = 0; i < norm.length; i++) if (norm[i] !== ' ') { compactStr += norm[i]; compact.push(map[i]); }
    let from = 0;
    for (;;) {
      const at = compactStr.indexOf(pattern, from);
      if (at < 0) break;
      for (let k = at; k < at + pattern.length; k++) {
        const start = compact[k];
        marks[start] = true;
        // Also mark punctuation sitting between two highlighted letters.
        if (k > at) for (let x = compact[k - 1] + 1; x < start; x++) marks[x] = true;
      }
      from = at + pattern.length;
    }
  }
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === marks[i]) last.text += text[i];
    else parts.push({ text: text[i], hit: marks[i] });
  }
  return parts;
}

/** Text of the query without filters — what's worth sending to a TMDB search. */
export const freeText = (q: ParsedQuery) => [...q.phrases, ...q.terms].join(' ');
