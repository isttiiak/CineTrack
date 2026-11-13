import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink, Pencil, Trash2, Link as LinkIcon, Calendar, MonitorPlay, Star, Minus, Plus, Tv, StickyNote, Check } from 'lucide-react';
import type { MovieEntry, WatchMeta, WatchPlatform, WatchStatus } from '@/types';
import { getDetails, kindOf, platformOf, regularSeasons, resolveTmdbId, type TitleDetails } from '@/lib/titleData';
import { episodesLeft, isCaughtUp, nextEpisode, prevEpisode, statusAfterProgress, type EpisodePos } from '@/lib/progress';
import { formatWatchDate, precisionOf } from '@/lib/watchDate';
import { useRatings } from '@/hooks/useRatings';
import { RatingsRow } from '@/components/ratings/RatingsRow';
import { WhereToWatch } from '@/components/ratings/WhereToWatch';
import { WatchDateField } from '@/components/ui/watch-date-field';
import { PosterThumb } from './PosterThumb';
import { STATUS_CONFIG } from './StatusBadge';
import { safeUrl } from '@/lib/schema';
import { getImdbColor, ratingSourceOf, cn, PLATFORMS, SECTION_COLORS, SECTION_EMOJIS } from '@/lib/utils';

interface Props {
  entry: MovieEntry | null;
  meta: WatchMeta | null;
  onClose: () => void;
  onStatusChange: (status: WatchStatus) => void;
  onRatingChange: (rating: number | undefined) => void;
  onWatchedOnChange: (date: string | undefined) => void;
  onNotesChange: (notes: string) => void;
  onPlatformChange: (platform: WatchPlatform | undefined) => void;
  onEdit: () => void;
  onDelete: () => void;
  region: string;
  myServices: string[];
  /** Saves data looked up automatically (TMDB id, real IMDb rating/link). */
  onEnrich: (patch: Partial<MovieEntry>) => void;
  onProgress: (pos: EpisodePos | null, status: WatchStatus) => void;
}

const STATUSES: WatchStatus[] = ['plan', 'watching', 'watched'];
const MAX_NOTES = 500;

const sectionTitle = 'mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest';
const labelColor = { color: 'var(--text-disabled)' };
const panel = { background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' };

/**
 * Right-side sheet on desktop, bottom sheet on mobile.
 *
 * Built around what people do every day, all editable in place: status, watch date (as precise as
 * you remember it), rating, episode progress, platform and notes. Details that rarely change
 * (title, year, genres, section…) live behind "Edit details".
 */
export function EntryDrawer({ entry, meta, onClose, ...rest }: Props) {
  const open = entry !== null && meta !== null;
  // While an inline editor (notes, date) is open, Escape closes the editor, not the whole drawer.
  const editingRef = useRef(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/45"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              asChild forceMount aria-describedby={undefined}
              onEscapeKeyDown={(e) => { if (editingRef.current) e.preventDefault(); }}
            >
              <motion.div
                className={cn(
                  'fixed z-50 flex flex-col overflow-hidden border-2 focus:outline-none',
                  'shadow-[0_-14px_48px_-14px_rgb(var(--accent-rgb)/0.5)] sm:shadow-[-14px_0_48px_-14px_rgb(var(--accent-rgb)/0.5)]',
                  'inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl',
                  'sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[460px] sm:rounded-none sm:rounded-l-2xl',
                )}
                style={{ background: 'var(--bg-surface)', borderColor: 'rgb(var(--accent-rgb) / 0.75)' }}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              >
                <DrawerBody key={entry.id} entry={entry} meta={meta} editingRef={editingRef} {...rest} />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

/** Notes you can write and save without leaving the drawer. Ctrl/⌘+Enter saves, Esc cancels. */
function NotesEditor({ value, onSave, editingRef }: { value: string; onSave: (notes: string) => void; editingRef: React.MutableRefObject<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const latest = useRef({ editing, draft, value, onSave });
  latest.current = { editing, draft, value, onSave };

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { editingRef.current = editing; }, [editing, editingRef]);
  // Closing the drawer with unsaved changes keeps them rather than losing what you typed.
  useEffect(() => () => {
    const { editing: e, draft: d, value: v, onSave: save } = latest.current;
    editingRef.current = false;
    if (e && d.trim() !== v) save(d.trim().slice(0, MAX_NOTES));
  }, [editingRef]);

  const save = () => {
    onSave(draft.trim().slice(0, MAX_NOTES));
    setEditing(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (!editing) {
    return value ? (
      <button
        type="button" onClick={() => setEditing(true)}
        className="group w-full rounded-xl border px-3.5 py-3 text-left transition-colors hover:border-[var(--accent)]" style={panel}
        aria-label="Edit notes"
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{value}</p>
        <span className="mt-2 flex items-center gap-1 text-[11px] font-semibold" style={{ color: saved ? 'var(--accent-green)' : 'var(--accent-text)' }}>
          {saved ? <><Check className="h-3 w-3" /> Saved</> : <><Pencil className="h-3 w-3" /> Edit notes</>}
        </span>
      </button>
    ) : (
      <button
        type="button" onClick={() => setEditing(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed px-3.5 py-3 text-sm transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
      >
        <Plus className="h-4 w-4" /> Add your notes or a short review
        {saved && <span className="ml-auto flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-green)' }}><Check className="h-3 w-3" /> Saved</span>}
      </button>
    );
  }

  return (
    <div className="rounded-xl border p-2.5" style={{ ...panel, borderColor: 'var(--accent)' }}>
      <textarea
        autoFocus
        value={draft}
        maxLength={MAX_NOTES}
        rows={5}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        placeholder="What did you think? Favourite scene, who to recommend it to…"
        className="w-full resize-y rounded-lg bg-transparent px-1.5 py-1 text-sm leading-relaxed outline-none"
        style={{ color: 'var(--text-primary)' }}
        aria-label="Notes"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-disabled)' }}>{draft.length}/{MAX_NOTES}</span>
        <button type="button" onClick={cancel} className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
        <button
          type="button" onClick={save}
          className="rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-[filter] hover:brightness-110"
          style={{ background: 'var(--accent-gradient)', color: 'var(--accent-fg)' }}
        >
          Save notes
        </button>
      </div>
    </div>
  );
}

function DrawerBody({
  entry, meta, editingRef, onStatusChange, onRatingChange, onWatchedOnChange, onNotesChange, onPlatformChange,
  onEdit, onDelete, region, myServices, onEnrich, onProgress,
}: Omit<Props, 'entry' | 'meta' | 'onClose'> & { entry: MovieEntry; meta: WatchMeta; editingRef: React.MutableRefObject<boolean> }) {
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
      if (id && !entry.tmdbId) onEnrich({ tmdbId: id, ratingSource: entry.ratingSource ?? 'imdb' });
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

  // ── Watch date: when marking watched fills in today, make that obvious and easy to correct ──
  const [editingDate, setEditingDate] = useState(false);
  const [flash, setFlash] = useState(false);
  const [autoHint, setAutoHint] = useState(false);
  const dateCard = useRef<HTMLDivElement>(null);
  const previous = useRef({ status: meta.status, watchedOn: meta.watchedOn });
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const before = previous.current;
    previous.current = { status: meta.status, watchedOn: meta.watchedOn };
    if (meta.status === 'watched' && before.status !== 'watched' && meta.watchedOn && meta.watchedOn !== before.watchedOn) {
      setFlash(true); setAutoHint(true);
      timers.current.push(window.setTimeout(() => setFlash(false), 3000), window.setTimeout(() => setAutoHint(false), 14000));
      requestAnimationFrame(() => dateCard.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
  }, [meta.status, meta.watchedOn]);
  useEffect(() => { editingRef.current = editingDate; }, [editingDate, editingRef]);
  const openDateEditor = () => { setFlash(false); setAutoHint(false); setEditingDate((v) => !v); };
  const precision = precisionOf(meta.watchedOn);

  const providers = details?.['watch/providers']?.results?.[region];
  const streamsHere = new Set(
    [...(providers?.flatrate ?? []), ...(providers?.free ?? []), ...(providers?.ads ?? [])]
      .map((p) => platformOf(p.provider_name)).filter(Boolean),
  );
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
  const color = SECTION_COLORS[entry.section] ?? '#ea5fae';

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
            size="w342" className="aspect-[2/3] w-24 rounded-lg shadow-lg sm:w-28"
          />
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
              {entry.title}
            </DialogPrimitive.Title>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {[entry.year, entry.type, entry.country, meta.duration].filter(Boolean).join(' · ')}
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
            <h3 className={sectionTitle} style={labelColor}><Star className="h-3 w-3" /> Ratings</h3>
            <RatingsRow ratings={ratings} loading={ratingsLoading && !ratings} tmdbFallback={details?.vote_average || undefined} />
          </section>
        )}

        {/* ── Your log: everything you update day to day ───────────────────────── */}
        <section className="mt-6">
          <h3 className={sectionTitle} style={labelColor}>Status</h3>
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

        {meta.status === 'watched' && (
          <section className="mt-5">
            <h3 className={sectionTitle} style={labelColor}><Calendar className="h-3 w-3" /> Watched on</h3>
            <div
              ref={dateCard}
              className={cn('rounded-xl border transition-colors hover:border-[var(--accent)]', editingDate && 'border-[var(--accent)]', flash && 'attention')}
              style={panel}
            >
              <button
                type="button" onClick={openDateEditor} aria-expanded={editingDate}
                className="group/head flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                <span className="min-w-0">
                  <span className="block text-base font-semibold" style={{ color: meta.watchedOn ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {meta.watchedOn ? formatWatchDate(meta.watchedOn) : 'No date yet'}
                  </span>
                  <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {precision === 'day' ? 'Exact day' : precision === 'month' ? 'Month only' : precision === 'year' ? 'Year only' : 'Add the date, or just the year'}
                  </span>
                </span>
                <span
                  className={cn(
                    'flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all',
                    'group-hover/head:border-[var(--accent)] group-hover/head:bg-brand/15 group-hover/head:shadow-[0_0_14px_-4px_rgb(var(--accent-rgb)/0.7)]',
                    editingDate ? 'border-[var(--accent)] bg-brand/15' : 'border-[var(--border-subtle)]',
                  )}
                  style={{ color: 'var(--accent-text)' }}
                >
                  {editingDate ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {editingDate ? 'Done' : 'Change'}
                </span>
              </button>
              {editingDate && (
                <div className="border-t px-3.5 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
                  <WatchDateField idPrefix="drawer-watched" value={meta.watchedOn} onChange={onWatchedOnChange} />
                </div>
              )}
            </div>
            {autoHint && !editingDate && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--accent-text)' }}>
                Set to today. Watched it earlier? Tap <b>Change</b> to pick the date, or just the year.
              </p>
            )}
          </section>
        )}

        <section className="mt-5">
          <h3 className={cn(sectionTitle, 'justify-between')} style={labelColor}>
            <span className="flex items-center gap-1.5"><Star className="h-3 w-3" /> My rating</span>
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
                    background: filled ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'var(--bg-elevated)',
                    color: filled ? 'var(--accent-text)' : 'var(--text-muted)',
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
            <h3 className={sectionTitle} style={labelColor}><Tv className="h-3 w-3" /> Progress</h3>
            <div className="rounded-xl border p-3" style={panel}>
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
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-opacity disabled:opacity-30"
                  style={{ background: 'var(--accent-gradient)', color: 'var(--accent-fg)' }}
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

        <section className="mt-5">
          <h3 className={sectionTitle} style={labelColor}><MonitorPlay className="h-3 w-3" /> Watched on platform</h3>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Platform">
            {PLATFORMS.map((p) => {
              const active = meta.watchPlatform === p;
              const here = streamsHere.has(p);
              return (
                <button
                  key={p} type="button" aria-pressed={active}
                  onClick={() => onPlatformChange(active ? undefined : p)}
                  title={here ? `${p}: streaming in your country` : p}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                  style={active
                    ? { color: 'var(--accent-text)', borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }
                    : { color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
                >
                  {here && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent-green)' }} aria-hidden />}
                  {p}
                </button>
              );
            })}
          </div>
          {streamsHere.size > 0 && (
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: 'var(--accent-green)' }} /> streams in your country
            </p>
          )}
          {watchLink && (
            <a
              href={watchLink} target="_blank" rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)', background: 'color-mix(in srgb, var(--accent-cyan) 8%, transparent)' }}
            >
              <LinkIcon className="h-4 w-4" /> Open watch link
            </a>
          )}
        </section>

        <section className="mt-5">
          <h3 className={sectionTitle} style={labelColor}><StickyNote className="h-3 w-3" /> Notes</h3>
          <NotesEditor value={meta.notes ?? ''} onSave={onNotesChange} editingRef={editingRef} />
        </section>

        {/* ── About this title: public information ─────────────────────────────── */}
        <div className="mt-7 border-t pt-5" style={{ borderColor: 'var(--border-subtle)' }}>
          {(tmdbId || detailsLoading) && (
            <section>
              <h3 className={sectionTitle} style={labelColor}><MonitorPlay className="h-3 w-3" /> Where to watch</h3>
              <WhereToWatch providers={providers} region={region} myServices={myServices} loading={detailsLoading} />
            </section>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--border-subtle)', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
          title="Change the title, year, genres, section and other details"
        >
          <Pencil className="h-4 w-4" /> Edit details
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
