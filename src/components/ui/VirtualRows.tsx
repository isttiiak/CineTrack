import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { averageHeight, rowLayout, scrollCompensation, visibleRange } from '@/lib/virtualRows';

interface Props {
  count: number;
  rowKey: (index: number) => string;
  renderRow: (index: number) => React.ReactNode;   // only called for rows near the screen
  estimate?: (index: number, average: number) => number;   // height before a row has been measured
  gap?: number;
  overscan?: number;                                 // px rendered above and below the screen
}

const DEFAULT_ROW = 380;

/**
 * A long vertical list that renders only the rows near the screen (the page itself scrolls). Row heights are
 * measured as rows are drawn and estimated (from the average) for the rest; spacers stand in for the rows
 * that are not rendered. When a row above the screen turns out taller or shorter than estimated, the page is
 * scrolled by the difference so what you are looking at doesn't jump.
 */
export function VirtualRows({ count, rowKey, renderRow, estimate, gap = 12, overscan = 900 }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const heights = useRef(new Map<string, number>());
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [viewTop, setViewTop] = useState(0);      // scroll position inside the list, in 100 px steps
  const [viewHeight, setViewHeight] = useState(() => window.innerHeight);

  const average = averageHeight(heights.current.values(), DEFAULT_ROW);
  const heightOf = (i: number) => heights.current.get(rowKey(i)) ?? estimate?.(i, average) ?? average;
  const layout = rowLayout(count, heightOf, gap);
  const [first, last] = visibleRange(layout.tops, heightOf, viewTop * 100 - overscan, viewTop * 100 + viewHeight + overscan);

  // Where the viewer is, relative to the list. Scroll events already come at most once per frame, and the
  // state only changes when the position crosses a 100 px step, so no extra throttling (a frame callback
  // would stall in a background tab and leave blank space on return).
  useEffect(() => {
    const update = () => {
      const el = container.current;
      if (!el) return;
      setViewTop(Math.floor(Math.max(0, -el.getBoundingClientRect().top) / 100));
      setViewHeight(window.innerHeight);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);

  // Measures every rendered row (images and ratings arrive after the first paint and change heights).
  const latest = useRef({ count, rowKey, gap, heightOf });
  latest.current = { count, rowKey, gap, heightOf };
  const observer = useMemo(() => typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
    const { count: n, rowKey: keyOf, gap: g, heightOf: h } = latest.current;
    const viewportTop = -(container.current?.getBoundingClientRect().top ?? 0);
    let shift = 0, changed = false;
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      const index = Number(el.dataset.index);
      if (!(index >= 0 && index < n)) continue;
      const key = keyOf(index);
      const next = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight);
      const old = h(index);
      if (next <= 0 || Math.abs(next - old) < 1 && heights.current.has(key)) continue;
      const top = rowLayout(index + 1, h, g).tops[index];
      shift += scrollCompensation(top, old, next, viewportTop);
      heights.current.set(key, next);
      changed = true;
    }
    if (shift) window.scrollBy(0, shift);
    if (changed) rerender();
  }), []);
  useEffect(() => () => observer?.disconnect(), [observer]);

  const rows = [];
  for (let i = first; i <= last; i++) {
    rows.push(<MeasuredRow key={rowKey(i)} index={i} observer={observer} marginBottom={i < count - 1 ? gap : 0}>{renderRow(i)}</MeasuredRow>);
  }
  const topSpace = count ? layout.tops[first] ?? 0 : 0;
  const bottomSpace = count && last >= first ? Math.max(0, layout.total - (layout.tops[last] + heightOf(last))) - (last < count - 1 ? gap : 0) : 0;
  return (
    // overflow-anchor off: the page is kept steady by the compensation above, native anchoring would add to it.
    <div ref={container} style={{ paddingTop: topSpace, paddingBottom: Math.max(0, bottomSpace), overflowAnchor: 'none' }}>
      {rows}
    </div>
  );
}

/** One row, watched by the list's ResizeObserver for as long as it is on screen. */
function MeasuredRow({ index, observer, marginBottom, children }: { index: number; observer: ResizeObserver | null; marginBottom: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !observer) return;
    observer.observe(el);
    return () => observer.unobserve(el);
  }, [observer]);
  return <div ref={ref} data-index={index} style={{ marginBottom }}>{children}</div>;
}
