import { CalendarPlus, CalendarClock, Loader2 } from 'lucide-react';
import type { MovieEntry, WatchMeta } from '@/types';
import { useUpcoming, type UpcomingItem } from '@/hooks/useUpcoming';
import { PosterThumb } from '@/components/watchlist/PosterThumb';
import { buildIcs } from '@/lib/ics';
import { localDateKey, todayKey } from '@/lib/utils';

interface Props {
  entries: MovieEntry[];
  meta: Record<string, WatchMeta>;
  onOpen: (entryId: string) => void;
  onResolved: (entryId: string, tmdbId: number) => void;
  onExported: (count: number) => void;
  onBrowseComingSoon: () => void;
}

const BADGE: Record<UpcomingItem['kind'], { text: string; color: string }> = {
  premiere: { text: 'Premiere', color: 'var(--accent-pink)' },
  episode: { text: 'New episode', color: 'var(--accent-cyan)' },
  release: { text: 'Release', color: 'var(--accent-yellow)' },
  aired: { text: 'Just aired', color: 'var(--accent-green)' },
  tba: { text: 'Returning', color: 'var(--text-muted)' },
};

function relative(date: string, today: string): string {
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${-days} days ago`;
  if (days < 7) return new Date(date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(date + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined });
}

function Row({ item, today, onOpen }: { item: UpcomingItem; today: string; onOpen: () => void }) {
  const b = BADGE[item.kind];
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
      <PosterThumb title={item.entry.title} year={item.entry.year} type={item.entry.type} tmdbId={item.entry.tmdbId} posterUrl={item.entry.posterUrl} size="w92" className="h-[60px] w-[40px]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.entry.title}</p>
        <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: b.color }}>{b.text}</span>
        {item.date && <span className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{relative(item.date, today)}</span>}
      </div>
    </button>
  );
}

/** New episodes, season premieres and film releases for titles in the list, plus a calendar export. */
export function UpcomingPage({ entries, meta, onOpen, onResolved, onExported, onBrowseComingSoon }: Props) {
  const { items, loading, progress } = useUpcoming(entries, meta, true, onResolved);
  const today = todayKey();
  const in7 = localDateKey(new Date(Date.now() + 7 * 86_400_000));

  const dated = items.filter((i) => i.date && i.kind !== 'aired').sort((a, b) => a.date!.localeCompare(b.date!));
  const groups: [string, UpcomingItem[]][] = [
    ['Just aired', items.filter((i) => i.kind === 'aired').sort((a, b) => b.date!.localeCompare(a.date!))],
    ['This week', dated.filter((i) => i.date! <= in7)],
    ['Later', dated.filter((i) => i.date! > in7)],
    ['Returning, date not announced', items.filter((i) => i.kind === 'tba')],
  ];

  const exportIcs = () => {
    const events = dated.map((i) => ({
      uid: `${i.entry.tmdbId ?? i.entry.id}-${i.date}-${i.kind}`,
      date: i.date!,
      title: `${i.entry.title} — ${i.label}`,
      url: i.entry.tmdbId ? `https://www.themoviedb.org/${i.entry.type === 'Series' ? 'tv' : 'movie'}/${i.entry.tmdbId}` : undefined,
    }));
    const blob = new Blob([buildIcs(events)], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'cinetrack-upcoming.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onExported(events.length);
  };

  const empty = !loading && groups.every(([, list]) => list.length === 0);

  return (
    <div className="pb-24">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {loading
            ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Checking {progress.done}/{progress.total} titles…</span>
            : <>New episodes and releases for <b>titles in your list</b>.{' '}
                <button onClick={onBrowseComingSoon} className="font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                  Browse upcoming releases for everyone →
                </button>
              </>}
        </p>
        <button
          onClick={exportIcs}
          disabled={dated.length === 0}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          title="Download a calendar file you can import into Google, Apple or Outlook Calendar"
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar (.ics)
        </button>
      </div>

      {empty ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          <CalendarClock className="h-8 w-8 opacity-40" />
          Nothing coming up. Add series or upcoming films to see new episodes and release dates here.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.filter(([, list]) => list.length > 0).map(([title, list]) => (
            <section key={title}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>{title}</h2>
              <div className="grid gap-1.5 md:grid-cols-2">
                {list.map((i) => <Row key={`${i.entry.id}-${i.kind}`} item={i} today={today} onOpen={() => onOpen(i.entry.id)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
