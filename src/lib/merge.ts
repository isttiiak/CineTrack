import type { MovieEntry, WatchMeta, WatchlistState } from '../types';
import { withAllSections } from './schema';

type Obj = Record<string, unknown>;

/** JSON with object keys sorted, so equal content compares equal regardless of key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Obj)[k]]))
      : v,
  );
}

/** True when two states hold the same list (lastModified is ignored). */
export function sameContent(a: WatchlistState | null, b: WatchlistState | null): boolean {
  if (!a || !b) return a === b;
  return canonical([a.entries, a.meta, a.sectionOrder]) === canonical([b.entries, b.meta, b.sectionOrder]);
}

/**
 * Field-level three-way merge of one record: a field this side changed since `base` wins,
 * every other field takes the other side's value. Fields are primitives, so `!==` is enough.
 */
function mergeFields<T extends object>(base: T | undefined, ours: T, theirs: T): T {
  const b = (base ?? {}) as Obj, o = ours as Obj, t = theirs as Obj;
  const out: Obj = {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(o), ...Object.keys(t)])) {
    const v = o[k] !== b[k] ? o[k] : t[k];
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/**
 * Three-way merge of two copies of a watchlist that both started from `base` (the last version
 * this device knows the server had). Edits on different entries, or on different fields of the
 * same entry, are all kept; when both sides changed the same field, `ours` wins. A delete on
 * either side wins over an edit on the other. Pass `base = null` when there is no common
 * ancestor: nothing is treated as deleted and `ours` wins every conflict.
 *
 * Unlike comparing `lastModified`, this never depends on device clocks and never drops one
 * device's edits because another device saved later.
 */
export function mergeWatchlist(base: WatchlistState | null, ours: WatchlistState, theirs: WatchlistState): WatchlistState {
  const baseEntries = new Map((base?.entries ?? []).map((e) => [e.id, e]));
  const ourEntries = new Map(ours.entries.map((e) => [e.id, e]));
  const theirEntries = new Map(theirs.entries.map((e) => [e.id, e]));
  const deleted = (id: string) => baseEntries.has(id) && (!ourEntries.has(id) || !theirEntries.has(id));

  const entries: MovieEntry[] = [];
  const meta: Record<string, WatchMeta> = {};
  const keep = (id: string) => {
    const o = ourEntries.get(id), t = theirEntries.get(id);
    entries.push(o && t ? mergeFields(baseEntries.get(id), o, t) : (o ?? t)!);
    const om = ours.meta[id], tm = theirs.meta[id];
    meta[id] = om && tm ? mergeFields(base?.meta[id], om, tm) : (om ?? tm ?? { id, status: 'plan' });
  };

  for (const e of ours.entries) if (!deleted(e.id)) keep(e.id);
  for (const e of theirs.entries) if (!ourEntries.has(e.id) && !deleted(e.id)) keep(e.id);

  const ourOrderChanged = !base || canonical(ours.sectionOrder) !== canonical(base.sectionOrder);
  const sectionOrder = withAllSections(ourOrderChanged ? ours.sectionOrder : theirs.sectionOrder, entries);
  const lastModified = ours.lastModified > theirs.lastModified ? ours.lastModified : theirs.lastModified;

  return { entries, meta, sectionOrder, lastModified };
}
