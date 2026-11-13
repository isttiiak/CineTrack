import { motion } from 'framer-motion';
import { Film, Plus, Star, ExternalLink, Loader2, Pencil } from 'lucide-react';
import { STATUS_CONFIG } from '@/components/watchlist/StatusBadge';
import type { WatchStatus } from '@/types';
import { TMDB_IMG, type TMDBItem } from '@/hooks/useTMDBDiscover';
import { useRatings, useSeen } from '@/hooks/useRatings';
import { RatingsRow } from '@/components/ratings/RatingsRow';

interface Props {
  item: TMDBItem;
  inList: boolean;
  adding: boolean;
  reason?: string;            // e.g. "Because you liked Dune" on the For-you tab
  listStatus?: WatchStatus;   // status of the matching entry when it's already in the list
  onAdd: () => void;
  onEdit?: () => void;        // edit the matching list entry
}

/** One Discover result. Ratings from IMDb / Rotten Tomatoes / Metacritic load when it scrolls into view. */
export function DiscoverCard({ item, inList, adding, reason, listStatus, onAdd, onEdit }: Props) {
  const title = item.title ?? item.name ?? '';
  const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4);
  const rating = item.vote_average;
  const { ref, seen } = useSeen<HTMLDivElement>();
  const { ratings, loading } = useRatings(item.media_type, item.id, seen);

  const label = adding
    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding…</>
    : inList ? '✓ In list' : <><Plus className="h-3.5 w-3.5" /> Add</>;

  return (
    <motion.div
      ref={ref}
      layout
      className="group relative flex flex-col overflow-hidden rounded-xl border"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="relative aspect-[2/3] overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
        {item.poster_path ? (
          <img src={`${TMDB_IMG}${item.poster_path}`} alt={title} loading="lazy"
               className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Film className="h-10 w-10 opacity-20" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}

        {rating > 0 && (
          <div
            className="absolute left-2 top-2 flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold"
            style={{ background: 'rgba(0,0,0,0.75)', color: rating >= 7 ? '#34d399' : rating >= 5.5 ? '#fbbf24' : '#f87171' }}
            title="TMDB user score"
          >
            <Star className="h-2.5 w-2.5 fill-current" />{rating.toFixed(1)}
          </div>
        )}

        <div
          className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase"
          style={{ background: 'rgba(0,0,0,0.7)', color: item.media_type === 'movie' ? 'var(--accent-cyan)' : 'var(--accent-pink)' }}
        >
          {item.media_type === 'movie' ? 'Film' : 'Series'}
        </div>

        {/* Already in the list: its status + a quick edit button, always visible */}
        {inList && onEdit && (
          <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between gap-1">
            {listStatus && (
              <span className="truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={STATUS_CONFIG[listStatus].style}>
                {STATUS_CONFIG[listStatus].label}
              </span>
            )}
            <button
              onClick={onEdit}
              className="ml-auto hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-indigo-500 mouse:flex"
              aria-label={`Edit ${title} in your list`}
              title="Edit in your list"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Add overlay on hover (desktop) */}
        <div
          className={`absolute inset-0 hidden items-end justify-center pb-3 opacity-0 transition-opacity group-hover:opacity-100 ${inList && onEdit ? '' : 'mouse:flex'}`}
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }}
        >
          <button
            onClick={onAdd}
            disabled={inList || adding}
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all"
            style={{
              background: inList ? 'rgba(52,211,153,0.2)' : 'var(--accent-purple)',
              color: inList ? '#34d399' : 'white',
              border: inList ? '1px solid #34d399' : 'none',
              cursor: inList ? 'default' : 'pointer',
              opacity: adding ? 0.7 : 1,
            }}
          >
            {label}
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <p className="line-clamp-2 text-xs font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{title}</p>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{year || '—'}</p>
        <RatingsRow ratings={ratings} loading={loading} compact className="mt-1" />
        {reason && <p className="mt-0.5 line-clamp-1 text-[10px] italic" style={{ color: 'var(--accent-purple)' }}>{reason}</p>}
        {item.overview && (
          <p className="mt-0.5 hidden text-[10px] leading-relaxed line-clamp-2 sm:block" style={{ color: 'var(--text-disabled)' }}>{item.overview}</p>
        )}

        {/* Phones: always-visible add button (no hover) */}
        <button
          onClick={inList && onEdit ? onEdit : onAdd}
          disabled={(inList && !onEdit) || adding}
          className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors mouse:hidden"
          style={{
            background: inList ? 'color-mix(in srgb, var(--accent-green) 15%, transparent)' : 'color-mix(in srgb, var(--accent-purple) 20%, transparent)',
            color: inList ? 'var(--accent-green)' : 'var(--accent-purple)',
            border: `1px solid ${inList ? 'color-mix(in srgb, var(--accent-green) 40%, transparent)' : 'color-mix(in srgb, var(--accent-purple) 40%, transparent)'}`,
          }}
        >
          {inList && onEdit ? <><Pencil className="h-3 w-3" /> Edit</> : label}
        </button>
      </div>

      <a
        href={`https://www.themoviedb.org/${item.media_type}/${item.id}`}
        target="_blank" rel="noopener noreferrer"
        className="absolute bottom-2 right-2 hidden opacity-0 transition-opacity group-hover:opacity-50 mouse:block"
        title="View on TMDB"
      >
        <ExternalLink className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
      </a>
    </motion.div>
  );
}
