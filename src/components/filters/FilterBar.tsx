import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FilterState, Section } from '@/types';
import { PLATFORMS } from '@/lib/utils';

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  sections: Section[];
}

export function FilterBar({ filters, onChange, sections }: Props) {
  const set = (k: keyof FilterState, v: string) => onChange({ ...filters, [k]: v });
  const hasFilter = filters.query || filters.section || filters.type || filters.status || filters.platform;

  return (
    <div className="flex flex-wrap gap-2 items-center mb-4">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
        <Input
          value={filters.query}
          onChange={(e) => set('query', e.target.value)}
          placeholder="Search title, genre, country…"
          className="pl-8 h-8 text-xs"
        />
      </div>

      <Select value={filters.section || '_all'} onValueChange={(v) => set('section', v === '_all' ? '' : v)}>
        <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Section" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All sections</SelectItem>
          {sections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.type || '_all'} onValueChange={(v) => set('type', v === '_all' ? '' : v)}>
        <SelectTrigger className="h-8 text-xs w-[90px]"><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All types</SelectItem>
          <SelectItem value="Film">Film</SelectItem>
          <SelectItem value="Series">Series</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.status || '_all'} onValueChange={(v) => set('status', v === '_all' ? '' : v)}>
        <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All statuses</SelectItem>
          <SelectItem value="plan">Plan to Watch</SelectItem>
          <SelectItem value="watching">Watching</SelectItem>
          <SelectItem value="watched">Watched</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.platform || '_all'} onValueChange={(v) => set('platform', v === '_all' ? '' : v)}>
        <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue placeholder="Platform" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All platforms</SelectItem>
          {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>

      {hasFilter && (
        <button
          onClick={() => onChange({ query: '', section: '', type: '', status: '', platform: '' })}
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
