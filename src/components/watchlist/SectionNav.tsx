import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, LayoutGrid } from 'lucide-react';
import { SECTION_COLORS, SECTION_EMOJIS, cn } from '@/lib/utils';

interface Props {
  sections: string[];                 // in user order; only sections that have entries
  counts: Record<string, number>;     // entries per section after filters
  total: number;
  active: string;                     // '' = all
  onSelect: (section: string) => void;
  onReorder: (order: string[]) => void;
}

const colorOf = (s: string) => SECTION_COLORS[s] ?? '#818cf8';
const emojiOf = (s: string) => SECTION_EMOJIS[s] ?? '🎬';

function SidebarItem({ section, count, active, onSelect }: {
  section: string; count: number; active: boolean; onSelect: () => void;
}) {
  const controls = useDragControls();
  const color = colorOf(section);
  return (
    <Reorder.Item value={section} dragListener={false} dragControls={controls} className="list-none">
      <div
        className={cn('group flex items-center gap-1 rounded-lg pr-2 transition-colors', !active && 'hover:bg-[var(--bg-hover)]')}
        style={active ? { background: `${color}18` } : undefined}
      >
        <span
          onPointerDown={(e) => controls.start(e)}
          className="cursor-grab touch-none py-2 pl-1 opacity-0 transition-opacity group-hover:opacity-60 active:cursor-grabbing"
          style={{ color: 'var(--text-muted)' }}
          aria-label={`Drag to reorder ${section}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm" aria-current={active ? 'page' : undefined}>
          <span className="text-base leading-none">{emojiOf(section)}</span>
          <span className="truncate font-medium" style={{ color: active ? color : 'var(--text-secondary)' }}>{section}</span>
          <span className="ml-auto font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{count}</span>
        </button>
      </div>
    </Reorder.Item>
  );
}

/** Desktop: sticky sidebar with drag-to-reorder sections. */
export function SectionSidebar({ sections, counts, total, active, onSelect, onReorder }: Props) {
  return (
    <nav className="sticky top-[92px] hidden max-h-[calc(100vh-110px)] w-56 flex-shrink-0 overflow-y-auto pr-2 lg:block" aria-label="Sections">
      <button
        onClick={() => onSelect('')}
        className={cn('mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors', active ? 'hover:bg-[var(--bg-hover)]' : '')}
        style={!active ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }}
        aria-current={!active ? 'page' : undefined}
      >
        <LayoutGrid className="h-4 w-4" /> All titles
        <span className="ml-auto font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{total}</span>
      </button>
      <p className="mb-1 mt-3 px-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>Sections</p>
      <Reorder.Group axis="y" values={sections} onReorder={onReorder} className="m-0 p-0">
        {sections.map((s) => (
          <SidebarItem
            key={s} section={s} count={counts[s] ?? 0} active={active === s}
            onSelect={() => onSelect(s)}
          />
        ))}
      </Reorder.Group>
    </nav>
  );
}

/** Mobile/tablet: horizontally scrolling chips. */
export function SectionChips({ sections, counts, total, active, onSelect }: Omit<Props, 'onReorder'>) {
  const chip = (key: string, label: React.ReactNode, count: number, isActive: boolean, color: string) => (
    <button
      key={key}
      onClick={() => onSelect(key)}
      className="flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
      style={{
        color: isActive ? color : 'var(--text-secondary)',
        borderColor: isActive ? color : 'var(--border-subtle)',
        background: isActive ? `${color}18` : 'var(--bg-surface)',
      }}
    >
      {label}<span className="font-mono opacity-60">{count}</span>
    </button>
  );
  return (
    <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden" style={{ scrollbarWidth: 'none' }}>
      {chip('', 'All', total, !active, 'var(--text-primary)')}
      {sections.map((s) => chip(s, <>{emojiOf(s)} {s}</>, counts[s] ?? 0, active === s, colorOf(s)))}
    </div>
  );
}
