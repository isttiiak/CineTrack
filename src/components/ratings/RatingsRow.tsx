import type { Ratings } from '@/lib/titleData';
import { cn } from '@/lib/utils';

const tone = (pct: number) => (pct >= 70 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#f87171');
const compactVotes = (n?: number) => !n ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);

interface Item { key: string; label: string; badge: React.ReactNode; value: string; color: string; title: string }

function items(r: Ratings, tmdbFallback?: number): Item[] {
  const out: Item[] = [];
  if (r.imdb) out.push({
    key: 'imdb', label: 'IMDb', color: tone(r.imdb * 10), value: r.imdb.toFixed(1),
    badge: <span className="rounded-[3px] bg-[#f5c518] px-1 text-[9px] font-black leading-[14px] text-black">IMDb</span>,
    title: `IMDb ${r.imdb.toFixed(1)}/10${r.imdbVotes ? ` · ${compactVotes(r.imdbVotes)} votes` : ''}`,
  });
  if (r.rt !== undefined) out.push({
    key: 'rt', label: 'Rotten Tomatoes', color: tone(r.rt), value: `${Math.round(r.rt)}%`,
    badge: <span aria-hidden>{r.rt >= 60 ? '🍅' : '🤢'}</span>,
    title: `Rotten Tomatoes critics ${Math.round(r.rt)}%`,
  });
  if (r.rtAudience !== undefined) out.push({
    key: 'rta', label: 'Audience', color: tone(r.rtAudience), value: `${Math.round(r.rtAudience)}%`,
    badge: <span aria-hidden>🍿</span>,
    title: `Rotten Tomatoes audience ${Math.round(r.rtAudience)}%`,
  });
  if (r.metacritic !== undefined) out.push({
    key: 'mc', label: 'Metacritic', color: tone(r.metacritic), value: String(Math.round(r.metacritic)),
    badge: <span className="rounded-[3px] px-1 text-[9px] font-black leading-[14px] text-black" style={{ background: tone(r.metacritic) }}>MC</span>,
    title: `Metacritic ${Math.round(r.metacritic)}/100`,
  });
  if (r.letterboxd) out.push({
    key: 'lb', label: 'Letterboxd', color: tone(r.letterboxd * 20), value: r.letterboxd.toFixed(1),
    badge: <span className="flex gap-px" aria-hidden><i className="h-1.5 w-1.5 rounded-full bg-[#ff8000]" /><i className="h-1.5 w-1.5 rounded-full bg-[#00e054]" /><i className="h-1.5 w-1.5 rounded-full bg-[#40bcf4]" /></span>,
    title: `Letterboxd ${r.letterboxd.toFixed(1)}/5`,
  });
  const t = r.tmdb ?? tmdbFallback;
  if (t) out.push({
    key: 'tmdb', label: 'TMDB', color: tone(t * 10), value: `${Math.round(t * 10)}%`,
    badge: <span className="rounded-[3px] bg-[#01b4e4] px-1 text-[9px] font-black leading-[14px] text-[#0d253f]">TMDB</span>,
    title: `TMDB user score ${Math.round(t * 10)}%`,
  });
  return out;
}

/**
 * Ratings from every site we have data for. `compact` (cards) shows the first few as tiny chips;
 * the full version (detail drawer) shows labelled tiles.
 */
export function RatingsRow({ ratings, loading, compact, tmdbFallback, max = 3, className }: {
  ratings: Ratings | null; loading?: boolean; compact?: boolean; tmdbFallback?: number; max?: number; className?: string;
}) {
  if (loading && !ratings) {
    return <div className={cn('flex gap-1', className)}>{[0, 1, 2].map((i) => <span key={i} className="h-4 w-10 animate-pulse rounded" style={{ background: 'var(--bg-elevated)' }} />)}</div>;
  }
  if (!ratings) return null;
  // Cards show the best-known three (IMDb, Rotten Tomatoes critics, Metacritic); TMDB is already on the poster.
  const list = items(ratings, tmdbFallback).filter((i) => !compact || (i.key !== 'tmdb' && i.key !== 'rta'));
  if (list.length === 0) return null;

  if (compact) {
    return (
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
        {list.slice(0, max).map((i) => (
          <span key={i.key} title={i.title} className="inline-flex items-center gap-1 font-mono text-[10px] font-bold" style={{ color: i.color }}>
            {i.badge}{i.value}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-3 gap-1.5', className)}>
      {list.map((i) => (
        <div key={i.key} title={i.title} className="rounded-lg px-2 py-1.5" style={{ background: 'var(--bg-elevated)' }}>
          <div className="flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{i.badge}<span className="truncate">{i.label}</span></div>
          <div className="mt-0.5 font-mono text-sm font-bold" style={{ color: i.color }}>{i.value}</div>
        </div>
      ))}
    </div>
  );
}
