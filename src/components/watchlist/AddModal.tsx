import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Film, Loader2, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GenreSelector } from '@/components/ui/genre-selector';
import type { MovieEntry, WatchMeta, WatchStatus, MediaType, WatchPlatform, Section } from '@/types';
import { SECTIONS, PLATFORMS, ratingSourceOf, todayKey } from '@/lib/utils';
import { findDuplicate, findSimilar } from '@/lib/duplicates';
import { useTitleSuggestions } from '@/hooks/useTitleSuggestions';
import { fetchTMDBDetails, TMDB_IMG, type TMDBItem } from '@/hooks/useTMDBDiscover';
import { getRatings, TMDB_GENRES } from '@/lib/titleData';
import { safeUrl, clampRating } from '@/lib/schema';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (entry: Omit<MovieEntry, 'id' | 'isCustom'>, meta: Partial<WatchMeta>) => void;
  onOpenExisting?: (entry: MovieEntry) => void;
  editEntry?: MovieEntry | null;
  editMeta?: WatchMeta | null;
  existingEntries?: MovieEntry[];
  sections?: string[];
}

const DEFAULT_ENTRY: Omit<MovieEntry, 'id' | 'isCustom'> = {
  title: '', year: '', country: '', genre: '', imdbRating: '', imdbUrl: '',
  section: 'General', type: 'Film',
};
const DEFAULT_META: Partial<WatchMeta> = {
  status: 'plan', personalRating: undefined,
  notes: '', watchedOn: '', watchPlatform: '', watchLink: '', duration: '',
};

export function AddModal({ open, onClose, onSave, onOpenExisting, editEntry, editMeta, existingEntries = [], sections = [] }: Props) {
  const [entry, setEntry] = useState<Omit<MovieEntry, 'id' | 'isCustom'>>(DEFAULT_ENTRY);
  const [meta, setMeta] = useState<Partial<WatchMeta>>(DEFAULT_META);
  const [customSection, setCustomSection] = useState('');
  const [titleFocused, setTitleFocused] = useState(false);
  const [pickedTitle, setPickedTitle] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);

  // Adding a new title: suggest matches from TMDB while typing; picking one fills in everything.
  const suggestOpen = !editEntry && titleFocused && entry.title.trim().length >= 2 && entry.title !== pickedTitle;
  const { items: suggestions, loading: suggestLoading } = useTitleSuggestions(entry.title, !editEntry && entry.title !== pickedTitle);

  const pick = async (item: TMDBItem) => {
    const kind = item.media_type;
    const type: MediaType = kind === 'tv' ? 'Series' : 'Film';
    const title = item.title ?? item.name ?? '';
    setPickedTitle(title);
    setTitleFocused(false);
    setEntry((p) => ({
      ...p,
      title,
      year: (item.release_date ?? item.first_air_date ?? '').slice(0, 4),
      type,
      genre: item.genre_ids.map((g) => TMDB_GENRES[g]).filter(Boolean).join(', '),
      posterUrl: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : undefined,
      tmdbId: item.id,
      imdbRating: item.vote_average > 0 ? item.vote_average.toFixed(1) : '',
      ratingSource: 'tmdb',
      section: p.section === 'General' && type === 'Series' ? 'TV Series' : p.section === 'TV Series' && type === 'Film' ? 'General' : p.section,
    }));
    setFilling(true);
    const [details, ratings] = await Promise.all([fetchTMDBDetails(item.id, kind), getRatings(kind, item.id)]);
    setFilling(false);
    setEntry((p) => p.tmdbId !== item.id ? p : {
      ...p,
      country: p.country || details.country,
      imdbUrl: p.imdbUrl || details.imdbUrl,
      ...(ratings?.imdb ? { imdbRating: ratings.imdb.toFixed(1), ratingSource: 'imdb' as const } : {}),
    });
    setMeta((p) => ({ ...p, duration: p.duration || details.duration }));
  };

  useEffect(() => {
    if (editEntry) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, isCustom: _ic, ...rest } = editEntry;
      setEntry(rest);
    } else {
      setEntry(DEFAULT_ENTRY);
    }
    setMeta(editMeta ? { ...editMeta } : DEFAULT_META);
    setCustomSection('');
    setPickedTitle(editEntry ? editEntry.title : null);
  }, [editEntry, editMeta, open]);

  // Predefined sections plus any custom ones the user already has, so they can be re-picked.
  const sectionOptions = useMemo(() => {
    const all = [...SECTIONS, ...sections.filter((s) => !(SECTIONS as readonly string[]).includes(s))];
    if (entry.section !== '__custom__' && !all.includes(entry.section)) all.push(entry.section);
    return all;
  }, [sections, entry.section]);

  // "same" = definitely already listed; "similar" = probably (other type, spacing, a typo away).
  const match = useMemo(
    () => entry.title.trim() ? findSimilar(existingEntries, entry, editEntry?.id) : null,
    [existingEntries, entry, editEntry],
  );
  const duplicate = match?.entry ?? null;
  const inList = (item: TMDBItem) => !!findDuplicate(existingEntries, {
    title: item.title ?? item.name ?? '', year: (item.release_date ?? item.first_air_date ?? '').slice(0, 4),
    type: item.media_type === 'tv' ? 'Series' : 'Film', imdbUrl: '', tmdbId: item.id,
  }, editEntry?.id);

  const imdbUrlInvalid = !!entry.imdbUrl.trim() && !safeUrl(entry.imdbUrl);
  const watchLinkInvalid = !!meta.watchLink?.trim() && !safeUrl(meta.watchLink);
  const canSave = !!entry.title.trim() && !imdbUrlInvalid && !watchLinkInvalid;

  const handleSave = () => {
    if (!canSave) return;
    const finalSection = entry.section === '__custom__'
      ? (customSection.trim().slice(0, 60) || 'General')
      : entry.section;
    onSave(
      { ...entry, title: entry.title.trim(), imdbUrl: safeUrl(entry.imdbUrl), section: finalSection as Section },
      { ...meta, personalRating: clampRating(meta.personalRating), watchLink: safeUrl(meta.watchLink) },
    );
    onClose();
  };

  const setE = <K extends keyof typeof entry>(k: K, v: typeof entry[K]) =>
    setEntry((p) => ({ ...p, [k]: v }));
  const setM = <K extends keyof WatchMeta>(k: K, v: WatchMeta[K]) =>
    setMeta((p) => ({ ...p, [k]: v }));

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Edit Entry' : 'Add New Entry'}</DialogTitle>
          </DialogHeader>

          <div className="px-6 pb-2 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ct-title">Title *</Label>
              <Input
                id="ct-title" name="title"
                value={entry.title}
                onChange={(e) => {
                  const title = e.target.value;
                  // Editing the title after picking a suggestion unlinks that TMDB title.
                  setEntry((p) => p.tmdbId && !editEntry && title !== pickedTitle
                    ? { ...p, title, tmdbId: undefined, posterUrl: undefined }
                    : { ...p, title });
                }}
                onFocus={() => setTitleFocused(true)}
                onBlur={() => setTitleFocused(false)}
                placeholder={editEntry ? 'Movie or series title' : 'Start typing — pick a match to fill everything in'}
                autoComplete="off"
                autoFocus
                aria-autocomplete="list"
                aria-expanded={suggestOpen}
              />
              {suggestOpen && (suggestLoading || suggestions.length > 0) && (
                <div
                  className="overflow-hidden rounded-lg border"
                  style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
                  role="listbox"
                  onMouseDown={(e) => e.preventDefault()}   // keep the title input focused
                >
                  {suggestLoading && suggestions.length === 0 && (
                    <p className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}><Loader2 className="h-3 w-3 animate-spin" /> Searching TMDB…</p>
                  )}
                  {suggestions.map((item) => {
                    const listed = inList(item);
                    return (
                      <button
                        key={`${item.media_type}-${item.id}`}
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => void pick(item)}
                        className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                      >
                        <span className="h-10 w-7 flex-shrink-0 overflow-hidden rounded" style={{ background: 'var(--bg-surface)' }}>
                          {item.poster_path
                            ? <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                            : <Film className="m-1.5 h-4 w-4 opacity-30" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.title ?? item.name}</span>
                          <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {[(item.release_date ?? item.first_air_date ?? '').slice(0, 4), item.media_type === 'tv' ? 'Series' : 'Film'].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {listed && <span className="flex flex-shrink-0 items-center gap-1 text-[10px] font-semibold text-amber-400"><Check className="h-3 w-3" /> In your list</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {filling && (
                <p className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}><Loader2 className="h-3 w-3 animate-spin" /> Filling in details…</p>
              )}
              {duplicate && match && (
                <div
                  className="mt-1 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)', color: 'var(--text-secondary)' }}
                  role="status"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                  <span className="flex-1">
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {duplicate.title}{duplicate.year ? ` (${duplicate.year})` : ''}
                    </span>{' '}
                    {match.kind === 'same' ? (
                      <>is already in <span className="font-medium">{duplicate.section}</span>. Change the year if this is a different release.</>
                    ) : (
                      <>({duplicate.type}) in <span className="font-medium">{duplicate.section}</span> looks like the same title. Is this a duplicate?</>
                    )}
                  </span>
                  {onOpenExisting && (
                    <button
                      type="button"
                      onClick={() => { onClose(); onOpenExisting(duplicate); }}
                      className="flex-shrink-0 font-semibold text-amber-400 hover:underline"
                    >
                      View
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ct-year">Year</Label>
                <Input id="ct-year" name="year" value={entry.year} onChange={(e) => setE('year', e.target.value)} placeholder="2024" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ct-country">Country</Label>
                <Input id="ct-country" name="country" value={entry.country} onChange={(e) => setE('country', e.target.value)} placeholder="USA" />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Genre</Label>
              <GenreSelector value={entry.genre} onChange={(v) => setE('genre', v)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select value={entry.type} onValueChange={(v) => setE('type', v as MediaType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Film">Film</SelectItem>
                    <SelectItem value="Series">Series</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Section</Label>
                <Select value={entry.section} onValueChange={(v) => setE('section', v as Section)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sectionOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    <SelectItem value="__custom__">+ Custom…</SelectItem>
                  </SelectContent>
                </Select>
                {entry.section === '__custom__' && (
                  <Input
                    value={customSection}
                    onChange={(e) => setCustomSection(e.target.value)}
                    maxLength={60}
                    placeholder="Section name"
                    className="mt-1.5"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ct-imdb-rating">{ratingSourceOf(entry) === 'tmdb' ? 'Rating (from TMDB)' : 'IMDb Rating'}</Label>
                {/* Typing a score yourself marks it as an IMDb score from then on. */}
                <Input id="ct-imdb-rating" name="imdbRating" value={entry.imdbRating} onChange={(e) => setEntry((p) => ({ ...p, imdbRating: e.target.value, ratingSource: 'imdb' }))} placeholder="8.3" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ct-imdb-url">IMDb URL</Label>
                <Input id="ct-imdb-url" name="imdbUrl" value={entry.imdbUrl} onChange={(e) => setE('imdbUrl', e.target.value)} placeholder="https://imdb.com/..." aria-invalid={imdbUrlInvalid} />
                {imdbUrlInvalid && <span className="text-[11px] text-red-400">Must start with https://</span>}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ct-duration">Duration</Label>
              <Input
                id="ct-duration" name="duration"
                value={meta.duration ?? ''}
                onChange={(e) => setM('duration', e.target.value)}
                placeholder="e.g. 2h 28m or 45 min/ep"
              />
            </div>

            <div className="border-t border-[var(--border-subtle)] pt-3 grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  {/* Editing an entry to Watched pre-fills today (visible and clearable); a new entry
                      keeps an empty date, since it may have been watched long ago. */}
                  <Select
                    value={meta.status ?? 'plan'}
                    onValueChange={(v) => setMeta((p) => ({
                      ...p,
                      status: v as WatchStatus,
                      ...(editEntry && v === 'watched' && p.status !== 'watched' && !p.watchedOn ? { watchedOn: todayKey() } : {}),
                    }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plan">Plan to Watch</SelectItem>
                      <SelectItem value="watching">Watching</SelectItem>
                      <SelectItem value="watched">Watched</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ct-rating">My Rating (1–10)</Label>
                  <Input
                    id="ct-rating" name="personalRating"
                    type="number" min={1} max={10}
                    value={meta.personalRating ?? ''}
                    onChange={(e) => setM('personalRating', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="8"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Platform</Label>
                  <Select
                    value={meta.watchPlatform || '_none'}
                    onValueChange={(v) => setM('watchPlatform', (v === '_none' ? '' : v) as WatchPlatform)}
                  >
                    <SelectTrigger><SelectValue placeholder="Platform" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ct-watched-on">Watched On</Label>
                  <Input
                    id="ct-watched-on" name="watchedOn"
                    type="date"
                    value={meta.watchedOn ?? ''}
                    onChange={(e) => setM('watchedOn', e.target.value)}
                    className="[color-scheme:dark]"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ct-watch-link">Watch Link (private)</Label>
                <Input
                  id="ct-watch-link" name="watchLink"
                  value={meta.watchLink ?? ''}
                  onChange={(e) => setM('watchLink', e.target.value)}
                  placeholder="https://..."
                  aria-invalid={watchLinkInvalid}
                />
                {watchLinkInvalid && <span className="text-[11px] text-red-400">Must be an http(s) link</span>}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="ct-notes">Notes / Review</Label>
                <Textarea
                  id="ct-notes" name="notes"
                  value={meta.notes ?? ''}
                  onChange={(e) => setM('notes', e.target.value.slice(0, 500))}
                  placeholder="Your thoughts..."
                  rows={3}
                />
                <span className="text-right text-[10px] text-[var(--text-disabled)]">
                  {(meta.notes ?? '').length}/500
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {editEntry ? 'Save Changes' : match?.kind === 'same' ? 'Add Anyway' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
