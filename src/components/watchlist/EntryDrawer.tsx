import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink, Pencil, Trash2, Link as LinkIcon, Clock, Calendar, MonitorPlay, Star } from 'lucide-react';
import type { MovieEntry, WatchMeta, WatchStatus } from '@/types';
import { PosterThumb } from './PosterThumb';
import { STATUS_CONFIG } from './StatusBadge';
import { safeUrl } from '@/lib/schema';
import { getImdbColor, cn, SECTION_COLORS, SECTION_EMOJIS } from '@/lib/utils';

interface Props {
  entry: MovieEntry | null;
  meta: WatchMeta | null;
  onClose: () => void;
  onStatusChange: (status: WatchStatus) => void;
  onRatingChange: (rating: number | undefined) => void;
  onEdit: () => void;
  onDelete: () => void;
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
export function EntryDrawer({ entry, meta, onClose, onStatusChange, onRatingChange, onEdit, onDelete }: Props) {
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
                <DrawerBody
                  entry={entry} meta={meta}
                  onStatusChange={onStatusChange} onRatingChange={onRatingChange}
                  onEdit={onEdit} onDelete={onDelete}
                />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

function DrawerBody({ entry, meta, onStatusChange, onRatingChange, onEdit, onDelete }: Omit<Props, 'entry' | 'meta' | 'onClose'> & { entry: MovieEntry; meta: WatchMeta }) {
  const imdbUrl = safeUrl(entry.imdbUrl);
  const watchLink = safeUrl(meta.watchLink);
  const hasImdb = entry.imdbRating && entry.imdbRating !== 'N/A';
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
            title={entry.title} year={entry.year} type={entry.type} posterUrl={entry.posterUrl}
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
            {hasImdb && (
              imdbUrl ? (
                <a href={imdbUrl} target="_blank" rel="noopener noreferrer"
                   className={cn('mt-3 inline-flex items-center gap-1 font-mono text-sm font-bold hover:underline', getImdbColor(entry.imdbRating))}>
                  ★ {entry.imdbRating} <span className="text-[10px] font-sans tracking-widest opacity-70">IMDb</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              ) : (
                <span className={cn('mt-3 inline-block font-mono text-sm font-bold', getImdbColor(entry.imdbRating))}>★ {entry.imdbRating}</span>
              )
            )}
          </div>
        </div>

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

        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>
            <Star className="h-3 w-3" /> Notes
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
