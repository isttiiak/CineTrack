/**
 * Pure helpers behind the windowed Discover lists (components/ui/VirtualRows): which rows are near the
 * screen, where they sit, and how to chunk titles into rows. Long scrolls (the Movies tab reaches ~600
 * titles) used to keep every card in the page: 17,000 DOM nodes and a full re-render of all of them on
 * every change. Only rows near the viewport are rendered now.
 */

/** Columns of the Discover grid by viewport width: mirrors `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`. */
export const GRID_BREAKPOINTS: readonly (readonly [minWidth: number, columns: number])[] = [[1280, 6], [1024, 5], [768, 4], [640, 3], [0, 2]];

export const columnsForWidth = (width: number): number => (GRID_BREAKPOINTS.find(([min]) => width >= min) ?? [0, 2])[1];

export type VRow<T> =
  | { key: string; kind: 'heading'; label: string }
  | { key: string; kind: 'cards'; items: T[] };

/**
 * Titles → rows of `columns` cards. With `groupOf`, a heading row is inserted whenever the label changes
 * (the list is already in order, so equal labels are neighbours). Row keys follow the first title, so a row
 * keeps its measured height while later pages are appended.
 */
export function buildRows<T extends { id: number; media_type?: string }>(items: T[], columns: number, groupOf?: (item: T) => string): VRow<T>[] {
  const cols = Math.max(1, Math.floor(columns));
  const rows: VRow<T>[] = [];
  let current: T[] = [];
  const flush = () => {
    if (current.length) rows.push({ key: `c${cols}-${current[0].media_type ?? ''}${current[0].id}`, kind: 'cards', items: current });
    current = [];
  };
  let label: string | null = null;
  for (const item of items) {
    const next = groupOf?.(item) ?? null;
    if (next !== label) { flush(); label = next; if (next !== null) rows.push({ key: `h-${next}`, kind: 'heading', label: next }); }
    current.push(item);
    if (current.length === cols) flush();
  }
  flush();
  return rows;
}

/** Top of every row (rows are `gap` apart) and the total height. `heightOf(i)` is the measured or estimated height of row i. */
export function rowLayout(count: number, heightOf: (index: number) => number, gap: number): { tops: number[]; total: number } {
  const tops: number[] = new Array(count);
  let y = 0;
  for (let i = 0; i < count; i++) { tops[i] = y; y += heightOf(i) + gap; }
  return { tops, total: Math.max(0, y - (count ? gap : 0)) };
}

/** First and last row (inclusive) that intersect [from, to] in list coordinates; `[0, -1]` when there are no rows. */
export function visibleRange(tops: number[], heightOf: (index: number) => number, from: number, to: number): [number, number] {
  const n = tops.length;
  if (!n) return [0, -1];
  // First row whose bottom reaches `from` (bottoms only grow), then every following row that starts before `to`.
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (tops[mid] + heightOf(mid) >= from) hi = mid; else lo = mid + 1; }
  const first = lo;
  let last = first;
  while (last < n - 1 && tops[last + 1] <= to) last++;
  return [first, last];
}

/**
 * How far to scroll when a row's height changes: a row that lies entirely above the viewport pushes
 * everything under it, so the page is scrolled by the same amount and the content on screen stays put.
 */
export function scrollCompensation(rowTop: number, oldHeight: number, newHeight: number, viewportTop: number): number {
  return rowTop + oldHeight <= viewportTop ? newHeight - oldHeight : 0;
}

/** Mean of the measured heights, or `fallback` before anything has been measured. */
export function averageHeight(heights: Iterable<number>, fallback: number): number {
  let sum = 0, n = 0;
  for (const h of heights) { sum += h; n++; }
  return n ? sum / n : fallback;
}
