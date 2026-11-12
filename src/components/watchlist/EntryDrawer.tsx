import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink, Pencil, Trash2, Link as LinkIcon, Clock, Calendar, MonitorPlay, Star, Minus, Plus, Tv } from 'lucide-react';
import type { MovieEntry, WatchMeta, WatchPlatform, WatchStatus } from '@/types';
import { getDetails, kindOf, regularSeasons, resolveTmdbId, suggestPlatform, type TitleDetails } from '@/lib/titleData';
import { episodesLeft, isCaughtUp, nextEpisode, prevEpisode, statusAfterProgress, type EpisodePos } from '@/lib/progress';
import { useRatings } from '@/hooks/useRatings';
import { RatingsRow } from '@/components/ratings/RatingsRow';
import { WhereToWatch } from '@/components/ratings/WhereToWatch';
import { PosterThumb } from './PosterThumb';
import { STATUS_CONFIG } from './StatusBadge';
import { safeUrl } from '@/lib/schema';
import { getImdbColor, ratingSourceOf, cn, SECTION_COLORS, SECTION_EMOJIS } from '@/lib/utils';

interface Props {
  entry: MovieEntry | null;
  meta: WatchMeta | null;
  onClose: () => void;
  onStatusChange: (status: WatchStatus) => void;
  onRatingChange: (rating: number | undefined) => void;
  onEdit: () => void;
  onDelete: () => void;
  region: string;
  myServices: string[];
  /** Saves data looked up automatically (TMDB id, real IMDb rating/link). */
  onEnrich: (patch: Partial<MovieEntry>) => void;
  onProgress: (pos: EpisodePos | null, status: WatchStatus) => void;
  onSetPlatform: (platform: WatchPlatform) => void;
}

const STATUSES: WatchStatus[] = ['plan', 'watching', 'watched'];

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>
        {icon}{label}
      </div>
      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{children}</div>
    </div>
  );
}

/** Right-side sheet on desktop, bottom sheet on mobile. Holds everything that used to be collapsed into rows. */
export function EntryDrawer({ entry, meta, onClose, ...rest }: Props) {
  const open = entry !== null && meta !== null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={cn(
                  'fixed z-50 flex flex-col overflow-hidden border shadow-2xl focus:outline-none',
                  'inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl',
                  'sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-2xl',
                )}
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              >
                <DrawerBody key={entry.id} entry={entry} meta={meta} {...rest} />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

const sectionTitle = 'mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest';

function DrawerBody({ entry, meta, onStatusChange, onRatingChange, onEdit, onDelete, region, myServices, onEnrich, onProgress, onSetPlatform }: Omit<Props, 'entry' | 'meta' | 'onClose'> & { entry: MovieEntry; meta: WatchMeta }) {
  const kind = kindOf(entry.type);
  const [tmdbId, setTmdbId] = useState<number | null>(entry.tmdbId ?? null);
  const [details, setDetails] = useState<TitleDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const { ratings, loading: ratingsLoading } = useRatings(kind, tmdbId);

  // Entries added by hand get their TMDB id looked up once and saved, so the rest works for them too.
  useEffect(() => {
    let active = true;
    resolveTmdbId(entry).then((id) => {
      if (!active) return;
      setTmdbId(id);
      if (id && !entry.tmdbId) onEnrich({ tmdbId: id });
      if (!id) setDetailsLoading(false);
    });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);

  useEffect(() => {
    if (!tmdbId) return;
    let active = true;
    getDetails(kind, tmdbId)
      .then((d) => { if (active) setDetails(d); })
      .catch(() => {})
      .finally(() => { if (active) setDetailsLoading(false); });
    return () => { active = false; };
  }, [kind, tmdbId]);

  // Keep the card's star rating honest: replace TMDB scores (or stale IMDb ones) with the live IMDb rating.
  useEffect(() => {
    if (!ratings) return;
    const patch: Partial<MovieEntry> = {};
    const live = ratings.imdb?.toFixed(1);
    if (live && (entry.imdbRating !== live || entry.ratingSource !== 'imdb')) { patch.imdbRating = live; patch.ratingSource = 'imdb'; }
    if (ratings.imdbId && !entry.imdbUrl) patch.imdbUrl = `https://www.imdb.com/title/${ratings.imdbId}/`;
    if (Object.keys(patch).length) onEnrich(patch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratings]);

  const providers = details?.['watch/providers']?.results?.[region];
  const suggested = !meta.watchPlatform ? suggestPlatform(providers, myServices) : null;
  const seasons = details ? regularSeasons(details) : [];
  const pos: EpisodePos | null = meta.progressSeason != null && meta.progressEpisode != null
    ? { season: meta.progressSeason, episode: meta.progressEpisode } : null;
  const logProgress = (next: EpisodePos | null) =>
    onProgress(next, statusAfterProgress(meta.status, next, details?.last_episode_to_air, details?.status));

  const imdbUrl = safeUrl(entry.imdbUrl);
  const watchLink = safeUrl(meta.watchLink);
  const hasImdb = entry.imdbRating && entry.imdbRating !== 'N/A';
  // Scores from Discover are TMDB's, so link and label them as TMDB, not IMDb.
  const fromTmdb = ratingSourceOf(entry) === 'tmdb';
  const ratingUrl = fromTmdb
    ? (entry.tmdbId ? `https://www.themoviedb.org/${entry.type === 'Series' ? 'tv' : 'movie'}/${entry.tmdbId}` : '')
    : imdbUrl;
  const color = SECTION_COLORS[entry.section] ?? '#818cf8';

  return (
    <>
      <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold"
          style={{ color, background: `${color}14`, borderLeft: `2px solid ${color}` }}
        >
          {SECTION_EMOJIS[entry.section] ?? '🎬'} {entry.section}
        </span>
        <DialogPrimitive.Close className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} aria-label="Close">
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex gap-4">
          <PosterThumb
            title={entry.title} year={entry.year} type={entry.type} tmdbId={entry.tmdbId} posterUrl={entry.posterUrl}
            size="w342" className="aspect-[2/3] w-28 rounded-lg shadow-lg"
          />
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
              {entry.title}
            </DialogPrimitive.Title>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {[entry.year, entry.type, entry.country].filter(Boolean).join(' · ')}
            </p>
            {entry.genre && (
              <div className="mt-2 flex flex-wrap gap-1">
                {entry.genre.split(',').map((g) => g.trim()).filter(Boolean).map((g) => (
                  <span key={g} className="rounded-md border px-1.5 py-0.5 text-[11px]" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}>{g}</span>
                ))}
              </div>
            )}
            {hasImdb && !ratings && (
              ratingUrl ? (
                <a href={ratingUrl} target="_blank" rel="noopener noreferrer"
                   className={cn('mt-3 inline-flex items-center gap-1 font-mono text-sm font-bold hover:underline', getImdbColor(entry.imdbRating))}>
                  ★ {entry.imdbRating} <span className="text-[10px] font-sans tracking-widest opacity-70">{fromTmdb ? 'TMDB' : 'IMDb'}</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              ) : (
                <span className={cn('mt-3 inline-block font-mono text-sm font-bold', getImdbColor(entry.imdbRating))}>★ {entry.imdbRating} <span className="text-[10px] font-sans tracking-widest opacity-70">{fromTmdb ? 'TMDB' : 'IMDb'}</span></span>
              )
            )}
          </div>
        </div>

        {(ratings || ratingsLoading) && (
          <section className="mt-5">
            <h3 className={sectionTitle} style={{ color: 'var(--text-disabled)' }}><Star className="h-3 w-3" /> Ratings</h3>
            <RatingsRow ratings={ratings} loading={ratingsLoading && !ratings} tmdbFallback={details?.vote_average || undefined} />
          </section>
        )}

        <section className="mt-6">
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>Status</h3>
          <div className="grid grid-cols-3 gap-1.5 rounded-xl p-1" style={{ background: 'var(--bg-elevated)' }}>
            {STATUSES.map((s) => {
              const active = meta.status === s;
              return (
                <button
                  key={s}
                  onClick={() => onStatusChange(s)}
                  aria-pressed={active}
                  className="rounded-lg px-2 py-2 text-xs font-semibold transition-all"
                  style={active ? STATUS_CONFIG[s].style : { color: 'var(--text-muted)', border: '1px solid transparent' }}
                >
                  {STATUS_CONFIG[s].label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5">
          <h3 className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>
            My Rating
            {meta.personalRating != null && (
              <button onClick={() => onRatingChange(undefined)} className="normal-case tracking-normal hover:underline" style={{ color: 'var(--text-muted)' }}>
                Clear
              </button>
            )}
          </h3>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const filled = meta.personalRating != null && n <= Math.round(meta.personalRating);
              return (
                <button
                  key={n}
                  onClick={() => onRatingChange(n)}
                  aria-label={`Rate ${n} out of 10`}
                  className="h-8 rounded-md font-mono text-xs font-semibold transition-colors"
                  style={{
                    background: filled ? 'color-mix(in srgb, var(--accent-cyan) 22%, transparent)' : 'var(--bg-elevated)',
                    color: filled ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </section>

        {entry.type === 'Series' && seasons.length > 0 && (
          <section className="mt-5">
            <h3 className={sectionTitle} style={{ color: 'var(--text-disabled)' }}><Tv className="h-3 w-3" /> Progress</h3>
            <div className="rounded-xl border p-3" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => pos && logProgress(prevEpisode(seasons, pos))}
                  disabled={!pos}
                  aria-label="Previous episode"
                  className="rounded-lg border p-2 transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-30"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <div className="font-mono text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {pos ? `S${pos.season} · E${pos.episode}` : 'Not started'}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {isCaughtUp(pos, details?.last_episode_to_air)
                      ? 'Caught up'
                      : `${episodesLeft(seasons, pos, details?.last_episode_to_air)} aired episodes left`}
                  </div>
                </div>
                <button
                  onClick={() => { const n = nextEpisode(seasons, pos); if (n) logProgress(n); }}
                  disabled={!nextEpisode(seasons, pos) || isCaughtUp(pos, details?.last_episode_to_air)}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-30"
                  style={{ background: 'var(--accent-purple)' }}
                >
                  <Plus className="h-3.5 w-3.5" /> Episode
                </button>
              </div>
              <div className="mt-2.5 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>Jump to</span>
                <select
                  aria-label="Season"
                  value={pos?.season ?? ''}
                  onChange={(e) => logProgress({ season: Number(e.target.value), episode: 1 })}
                  className="rounded-md border bg-transparent px-1.5 py-1"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                >
                  {!pos && <option value="">Season</option>}
                  {seasons.map((s) => <option key={s.season_number} value={s.season_number} style={{ background: 'var(--bg-surface)' }}>S{s.season_number}</option>)}
                </select>
                <select
                  aria-label="Episode"
                  value={pos?.episode ?? ''}
                  disabled={!pos}
                  onChange={(e) => pos && logProgress({ season: pos.season, episode: Number(e.target.value) })}
                  className="rounded-md border bg-transparent px-1.5 py-1 disabled:opacity-40"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                >
                  {!pos && <option value="">Ep</option>}
                  {Array.from({ length: seasons.find((s) => s.season_number === pos?.season)?.episode_count ?? 0 }, (_, i) => i + 1)
                    .map((n) => <option key={n} value={n} style={{ background: 'var(--bg-surface)' }}>E{n}</option>)}
                </select>
              </div>
              {details?.next_episode_to_air?.air_date && (
                <p className="mt-2 text-center text-[11px]" style={{ color: 'var(--accent-cyan)' }}>
                  Next: S{details.next_episode_to_air.season_number}E{details.next_episode_to_air.episode_number} airs {details.next_episode_to_air.air_date}
                </p>
              )}
            </div>
          </section>
        )}

        {(meta.duration || meta.watchPlatform || meta.watchedOn) && (
          <section className="mt-5 grid grid-cols-2 gap-2">
            {meta.duration && <Fact icon={<Clock className="h-3 w-3" />} label="Duration">{meta.duration}</Fact>}
            {meta.watchPlatform && <Fact icon={<MonitorPlay className="h-3 w-3" />} label="Platform">{meta.watchPlatform}</Fact>}
            {meta.watchedOn && <Fact icon={<Calendar className="h-3 w-3" />} label="Watched on">{meta.watchedOn}</Fact>}
          </section>
        )}

        {watchLink && (
          <a
            href={watchLink} target="_blank" rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)', background: 'color-mix(in srgb, var(--accent-cyan) 8%, transparent)' }}
          >
            <LinkIcon className="h-4 w-4" /> Open watch link
          </a>
        )}

        {(tmdbId || detailsLoading) && (
          <section className="mt-5">
            <h3 className={sectionTitle} style={{ color: 'var(--text-disabled)' }}><MonitorPlay className="h-3 w-3" /> Where to watch</h3>
            <WhereToWatch providers={providers} region={region} myServices={myServices} loading={detailsLoading} />
            {suggested && (
              <button
                onClick={() => onSetPlatform(suggested)}
                className="mt-2 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
              >
                Set platform to {suggested}
              </button>
            )}
          </section>
        )}

        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>
            <Pencil className="h-3 w-3" /> Notes
          </h3>
          {meta.notes ? (
            <p className="whitespace-pre-wrap rounded-xl border px-3 py-2.5 text-sm leading-relaxed"
               style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}>
              {meta.notes}
            </p>
          ) : (
            <button onClick={onEdit} className="text-sm hover:underline" style={{ color: 'var(--text-muted)' }}>+ Add notes</button>
          )}
        </section>
      </div>

      <div className="flex gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--border-subtle)', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
        >
          <Pencil className="h-4 w-4" /> Edit
        </button>
        <button
          onClick={onDelete}
          className="flex items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>
    </>
  );
}
