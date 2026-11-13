import type { MediaType, WatchStatus } from '../types';
import { parseTitleLink } from './links';

/** One title read from another site's export, before it is matched to TMDB. */
export interface ImportCandidate {
  key: string;                // de-duplication key across files (Letterboxd URI, IMDb id, or title+year)
  title: string;
  year: string;
  imdbId?: string;
  type?: MediaType;           // known for IMDb exports; Letterboxd is films only
  status: WatchStatus;
  rating?: number;            // 1–10
  watchedOn?: string;         // YYYY-MM-DD
  tmdbRef?: { kind: 'movie' | 'tv'; id: number };   // from a pasted TMDB link
  fullTitle?: string;         // "Wonder Woman 1984": the trailing number might be part of the title
  source: 'letterboxd' | 'imdb' | 'csv' | 'text';
}

export type ExportKind =
  | 'letterboxd-watched' | 'letterboxd-ratings' | 'letterboxd-diary' | 'letterboxd-watchlist'
  | 'imdb' | 'generic';

/** RFC 4180 CSV: quoted fields, escaped quotes (""), commas and newlines inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Works out which site/file a CSV came from from its header row (and file name, for Letterboxd). */
export function detectKind(headers: string[], fileName = ''): ExportKind {
  const h = headers.map(norm);
  const has = (...names: string[]) => names.every((n) => h.includes(n));
  const file = fileName.toLowerCase();
  if (has('letterboxd uri') || has('name', 'year', 'date')) {
    if (has('watched date') || /diary/.test(file)) return 'letterboxd-diary';
    if (has('rating') || /ratings/.test(file)) return 'letterboxd-ratings';
    if (/watchlist/.test(file)) return 'letterboxd-watchlist';
    return 'letterboxd-watched';
  }
  if (has('const') || h.some((x) => x === 'your rating' || x === 'title type')) return 'imdb';
  return 'generic';
}

const isoDate = (v: string | undefined): string | undefined => {
  const s = (v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (!s || Number.isNaN(t)) return undefined;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ratingOf = (v: string | undefined, scale: 5 | 10): number | undefined => {
  const n = parseFloat(v ?? '');
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(10, Math.max(1, Math.round(n * (10 / scale) * 10) / 10));
};

const typeFromImdb = (t: string | undefined): MediaType | undefined => {
  const s = (t ?? '').toLowerCase();
  if (!s) return undefined;
  return /series|episode|tv\s*mini|tvseries|tvminiseries/.test(s) && !/movie|special/.test(s) ? 'Series' : 'Film';
};

/** Rows of one export file → candidates. */
export function candidatesFrom(rows: string[][], fileName = ''): { kind: ExportKind; candidates: ImportCandidate[] } {
  if (rows.length < 2) return { kind: 'generic', candidates: [] };
  const [header, ...body] = rows;
  const kind = detectKind(header, fileName);
  const idx = new Map(header.map((h, i) => [norm(h), i]));
  const get = (row: string[], ...names: string[]) => {
    for (const n of names) { const i = idx.get(n); if (i !== undefined && row[i]?.trim()) return row[i].trim(); }
    return undefined;
  };

  const out: ImportCandidate[] = [];
  for (const row of body) {
    if (kind.startsWith('letterboxd')) {
      const title = get(row, 'name');
      if (!title) continue;
      const year = get(row, 'year') ?? '';
      out.push({
        key: get(row, 'letterboxd uri') ?? `${title.toLowerCase()}|${year}`,
        title, year, type: 'Film', source: 'letterboxd',
        status: kind === 'letterboxd-watchlist' ? 'plan' : 'watched',
        rating: ratingOf(get(row, 'rating'), 5),
        watchedOn: kind === 'letterboxd-diary' ? isoDate(get(row, 'watched date')) : undefined,
      });
    } else if (kind === 'imdb') {
      const title = get(row, 'title', 'original title');
      if (!title) continue;
      const imdbId = get(row, 'const')?.match(/tt\d+/)?.[0] ?? get(row, 'url')?.match(/tt\d+/)?.[0];
      const rating = ratingOf(get(row, 'your rating'), 10);
      out.push({
        key: imdbId ?? `${title.toLowerCase()}|${get(row, 'year') ?? ''}`,
        title, year: get(row, 'year') ?? '', imdbId, source: 'imdb',
        type: typeFromImdb(get(row, 'title type')),
        // An IMDb ratings export means watched; a list/watchlist export without a rating means planned.
        status: rating !== undefined || /rating/.test(fileName.toLowerCase()) ? 'watched' : 'plan',
        rating,
        watchedOn: isoDate(get(row, 'date rated')),
      });
    } else {
      const title = get(row, 'title', 'name', 'film', 'movie');
      if (!title) continue;
      const year = get(row, 'year') ?? '';
      out.push({
        key: `${title.toLowerCase()}|${year}`, title, year, source: 'csv',
        imdbId: row.join(',').match(/tt\d{5,10}/)?.[0],
        status: /watched|seen/i.test(get(row, 'status') ?? '') ? 'watched' : 'plan',
        rating: ratingOf(get(row, 'rating', 'my rating', 'your rating'), 10),
      });
    }
  }
  return { kind, candidates: out };
}

const STATUS_RANK: Record<WatchStatus, number> = { plan: 0, watching: 1, watched: 2 };

/**
 * Combines candidates from several files (a Letterboxd export has watched, ratings, diary and
 * watchlist files): one per title, the most-watched status, any rating, the latest watch date.
 */
export function mergeCandidates(lists: ImportCandidate[][]): ImportCandidate[] {
  const byKey = new Map<string, ImportCandidate>();
  for (const c of lists.flat()) {
    const prev = byKey.get(c.key);
    if (!prev) { byKey.set(c.key, { ...c }); continue; }
    byKey.set(c.key, {
      ...prev,
      status: STATUS_RANK[c.status] > STATUS_RANK[prev.status] ? c.status : prev.status,
      rating: c.rating ?? prev.rating,
      watchedOn: [prev.watchedOn, c.watchedOn].filter(Boolean).sort().pop(),
      imdbId: prev.imdbId ?? c.imdbId,
      type: prev.type ?? c.type,
    });
  }
  return [...byKey.values()];
}

/** Reads a .csv or a .zip (Letterboxd export) into merged candidates. */
export async function readExportFile(file: File): Promise<{ kinds: ExportKind[]; candidates: ImportCandidate[] }> {
  const files: { name: string; text: string }[] = [];
  if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
    const { unzipSync, strFromU8 } = await import('fflate');
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      // Only the top-level lists; skip deleted/, orphaned/, likes/ and the reviews/comments files.
      filter: (f) => /^(?:[^/]*\/)?(watched|ratings|diary|watchlist)\.csv$/i.test(f.name),
    });
    for (const [name, data] of Object.entries(entries)) files.push({ name, text: strFromU8(data) });
  } else {
    files.push({ name: file.name, text: await file.text() });
  }
  const parsed = files.map((f) => candidatesFrom(parseCsv(f.text), f.name));
  return { kinds: parsed.map((p) => p.kind), candidates: mergeCandidates(parsed.map((p) => p.candidates)) };
}

const BULLET = /^\s*(?:[-*•·▪◦–—>]+|\d{1,4}[.):]|\[[ x]\])\s*/i;

/**
 * A pasted list → candidates. One title per line (bullets and numbering are fine); a single line
 * can also be separated by semicolons, or by commas when it clearly is a list. Understands
 * "Title (2010)", "Title 2010", "Title (series)", IMDb/TMDB links and bare tt ids.
 */
export function candidatesFromText(text: string, status: WatchStatus = 'plan'): ImportCandidate[] {
  let lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1) {
    const one = lines[0];
    if (one.includes(';')) lines = one.split(';');
    else {
      const parts = one.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 3 && parts.every((p) => p.split(/\s+/).length <= 6)) lines = parts;
    }
  }
  const out: ImportCandidate[] = [];
  const seen = new Set<string>();
  for (const rawLine of lines) {
    let line = rawLine.replace(BULLET, '').trim();
    if (!line) continue;

    const link = parseTitleLink(line.match(/https?:\/\/\S+/)?.[0] ?? line);
    if (link) {
      const key = link.kind === 'imdb' ? link.id : `tmdb:${link.type}/${link.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key, title: '', year: '', status, source: 'text',
        ...(link.kind === 'imdb' ? { imdbId: link.id } : { tmdbRef: { kind: link.type, id: link.id }, type: link.type === 'tv' ? 'Series' : 'Film' }),
      });
      continue;
    }

    let type: MediaType | undefined;
    line = line.replace(/\s*[([](tv|series|show|tv series|mini-?series)[)\]]\s*/i, () => { type = 'Series'; return ' '; })
      .replace(/\s*[([](film|movie)[)\]]\s*/i, () => { type = 'Film'; return ' '; });
    let year = '';
    line = line.replace(/\s*[([]((?:19|20)\d{2})[)\]]\s*/, (_, y: string) => { year = y; return ' '; }).trim();
    let fullTitle: string | undefined;
    if (!year) {
      // "Past Lives 2023" → year; "Blade Runner 2049" (future) stays part of the title.
      const m = line.match(/^(.{2,}?)\s+[-–]?\s*((?:19|20)\d{2})$/);
      if (m && +m[2] <= new Date().getFullYear() + 2) { fullTitle = line; line = m[1].trim(); year = m[2]; }
    }
    const title = line.replace(/\s{2,}/g, ' ').replace(/[\s,;:–-]+$/, '').slice(0, 200);
    if (!title) continue;
    const key = `text:${title.toLowerCase()}|${year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, title, year, type, status, source: 'text', ...(fullTitle ? { fullTitle } : {}) });
  }
  return out.slice(0, 500);
}
