import { describe, expect, it } from 'vitest';
import { averageHeight, buildRows, columnsForWidth, rowLayout, scrollCompensation, visibleRange } from './virtualRows';

const it_ = (id: number, type: 'movie' | 'tv' = 'movie') => ({ id, media_type: type });

describe('columnsForWidth', () => {
  it('follows the grid breakpoints (2 / 3 / 4 / 5 / 6)', () => {
    expect([320, 639, 640, 767, 768, 1023, 1024, 1279, 1280, 2000].map(columnsForWidth)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
});

describe('buildRows', () => {
  it('chunks titles into rows of the column count, last row partial', () => {
    const rows = buildRows([1, 2, 3, 4, 5].map((n) => it_(n)), 2);
    expect(rows.map((r) => (r.kind === 'cards' ? r.items.map((i) => i.id) : null))).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('inserts a heading when the group changes, and starts a new row after it', () => {
    const items = [it_(1), it_(2), it_(3), it_(4)];
    const rows = buildRows(items, 3, (i) => (i.id <= 2 ? 'This week' : 'December'));
    expect(rows.map((r) => (r.kind === 'heading' ? `# ${r.label}` : r.items.map((i) => i.id).join(',')))).toEqual(['# This week', '1,2', '# December', '3,4']);
  });
  it('keeps row keys when more titles are appended (so measured heights survive paging)', () => {
    const a = buildRows([1, 2, 3, 4].map((n) => it_(n)), 2);
    const b = buildRows([1, 2, 3, 4, 5, 6].map((n) => it_(n)), 2);
    expect(b.slice(0, 2).map((r) => r.key)).toEqual(a.map((r) => r.key));
  });
  it('gives films and series with the same id different keys, and different column counts different keys', () => {
    expect(new Set(buildRows([it_(1, 'movie'), it_(1, 'tv')], 1).map((r) => r.key)).size).toBe(2);
    expect(buildRows([it_(1)], 2)[0].key).not.toBe(buildRows([it_(1)], 3)[0].key);
  });
  it('handles an empty list and a silly column count', () => {
    expect(buildRows([], 4)).toEqual([]);
    expect(buildRows([it_(1), it_(2)], 0).length).toBe(2);
  });
});

describe('rowLayout / visibleRange', () => {
  const h = () => 100;
  const { tops, total } = rowLayout(10, h, 10);        // rows at 0, 110, 220 … 990; total 1090

  it('stacks rows with the gap between them', () => {
    expect(tops.slice(0, 3)).toEqual([0, 110, 220]);
    expect(total).toBe(1090);
    expect(rowLayout(0, h, 10)).toEqual({ tops: [], total: 0 });
  });
  it('picks the rows that touch the window', () => {
    expect(visibleRange(tops, h, 0, 50)).toEqual([0, 0]);
    expect(visibleRange(tops, h, 0, 110)).toEqual([0, 1]);          // row 1 starts exactly at the edge
    expect(visibleRange(tops, h, 150, 400)).toEqual([1, 3]);        // row 1 ends at 210, row 3 starts at 330
    expect(visibleRange(tops, h, 100, 105)).toEqual([0, 0]);        // row 0 still reaches 100
    expect(visibleRange(tops, h, 105, 109)).toEqual([1, 1]);        // in the gap: the next row, never nothing
  });
  it('clamps at both ends and copes with an empty list', () => {
    expect(visibleRange(tops, h, -900, 80)).toEqual([0, 0]);
    expect(visibleRange(tops, h, 5000, 6000)).toEqual([9, 9]);
    expect(visibleRange([], h, 0, 100)).toEqual([0, -1]);
  });
  it('works with uneven heights', () => {
    const heights = [50, 300, 50, 300];
    const hh = (i: number) => heights[i];
    const l = rowLayout(4, hh, 0);
    expect(l.tops).toEqual([0, 50, 350, 400]);
    expect(visibleRange(l.tops, hh, 60, 340)).toEqual([1, 1]);
  });
});

describe('scrollCompensation', () => {
  it('moves the page by the change only for rows entirely above the viewport', () => {
    expect(scrollCompensation(0, 300, 320, 1000)).toBe(20);        // above: content below moved down 20px
    expect(scrollCompensation(0, 300, 280, 1000)).toBe(-20);
    expect(scrollCompensation(800, 300, 320, 1000)).toBe(0);       // spans the top edge
    expect(scrollCompensation(1200, 300, 320, 1000)).toBe(0);      // below the viewport top
  });
});

describe('averageHeight', () => {
  it('averages measured rows and falls back before any are measured', () => {
    expect(averageHeight([300, 400, 350], 380)).toBe(350);
    expect(averageHeight([], 380)).toBe(380);
  });
});
