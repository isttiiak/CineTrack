import { X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FilterState } from '@/types';
import { PLATFORMS, SECTION_EMOJIS } from '@/lib/utils';

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  sections: string[];                     // sections that have entries, in the user's order
  sectionCounts: Record<string, number>;  // entries per section after the other filters
  total: number;
  countries: { name: string; count: number }[];   // every country in the list, most titles first
  children?: React.ReactNode;             // extra toolbar controls (view toggle)
}

const trigger = 'h-8 w-auto flex-shrink-0 gap-1.5 whitespace-nowrap px-2.5 text-xs';

/** Filter + sort dropdowns. The search box lives in the tab row (App). */
export function FilterBar({ filters, onChange, sections, sectionCounts, total, countries, children }: Props) {
  const set = (k: keyof FilterState, v: string) => onChange({ ...filters, [k]: v });
  const hasFilter = filters.section || filters.country || filters.type || filters.status || filters.platform || filters.sort;

  return (
    // Phones: one horizontally scrolling row (the set of filters is fixed, so it stays short).
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {sections.length > 0 && (
        <Select value={filters.section || '_all'} onValueChange={(v) => set('section', v === '_all' ? '' : v)}>
          <SelectTrigger className={trigger} aria-label="Section"><SelectValue placeholder="Section" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All sections ({total})</SelectItem>
            {sections.map((s) => (
              <SelectItem key={s} value={s}>{SECTION_EMOJIS[s] ?? '🎬'} {s} ({sectionCounts[s] ?? 0})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {countries.length > 0 && (
        <Select value={filters.country || '_all'} onValueChange={(v) => set('country', v === '_all' ? '' : v)}>
          <SelectTrigger className={trigger} aria-label="Country"><SelectValue placeholder="Country" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All countries</SelectItem>
            {countries.map((c) => <SelectItem key={c.name} value={c.name}>{c.name} ({c.count})</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.type || '_all'} onValueChange={(v) => set('type', v === '_all' ? '' : v)}>
        <SelectTrigger className={trigger} aria-label="Type"><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All types</SelectItem>
          <SelectItem value="Film">Films</SelectItem>
          <SelectItem value="Series">Series</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.status || '_all'} onValueChange={(v) => set('status', v === '_all' ? '' : v)}>
        <SelectTrigger className={trigger} aria-label="Status"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All statuses</SelectItem>
          <SelectItem value="plan">Plan to Watch</SelectItem>
          <SelectItem value="watching">Watching</SelectItem>
          <SelectItem value="watched">Watched</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.platform || '_all'} onValueChange={(v) => set('platform', v === '_all' ? '' : v)}>
        <SelectTrigger className={trigger} aria-label="Platform"><SelectValue placeholder="Platform" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All platforms</SelectItem>
          {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.sort || '_default'} onValueChange={(v) => set('sort', v === '_default' ? '' : v)}>
        <SelectTrigger className={trigger} aria-label="Sort"><SelectValue placeholder="Sort" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_default">Recently added</SelectItem>
          <SelectItem value="title_asc">A → Z</SelectItem>
          <SelectItem value="title_desc">Z → A</SelectItem>
          <SelectItem value="year_desc">Newest year</SelectItem>
          <SelectItem value="year_asc">Oldest year</SelectItem>
          <SelectItem value="imdb_desc">Highest rated</SelectItem>
          <SelectItem value="imdb_asc">Lowest rated</SelectItem>
        </SelectContent>
      </Select>

      {hasFilter && (
        <button
          onClick={() => onChange({ ...filters, section: '', country: '', type: '', status: '', platform: '', sort: '' })}
          className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
      {children}
    </div>
  );
}
