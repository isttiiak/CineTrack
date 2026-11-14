import { useEffect, useState } from 'react';
import { Film, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { WatchDateField } from '@/components/ui/watch-date-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_CONFIG } from '@/components/watchlist/StatusBadge';
import { isUnreleased, releaseDate } from '@/lib/discoverFeeds';
import { formatWatchDate } from '@/lib/watchDate';
import { TMDB_IMG, type TMDBItem } from '@/hooks/useTMDBDiscover';
import { PLATFORMS, SECTIONS } from '@/lib/utils';
import { getDetails, suggestPlatform, type RegionProviders } from '@/lib/titleData';
import { suggestedSection } from '@/lib/sections';
import { useRatings } from '@/hooks/useRatings';
import { RatingsRow } from '@/components/ratings/RatingsRow';
import { WhereToWatch } from '@/components/ratings/WhereToWatch';
import type { WatchPlatform, WatchStatus } from '@/types';

export interface DiscoverAddChoice {
  status: WatchStatus;
  watchedOn?: string;
  personalRating?: number;
  watchPlatform?: WatchPlatform;
  section: string;
}

interface Props {
  item: TMDBItem | null;
  sections: string[];        // the user's existing sections
  region: string;
  myServices: string[];
  onCancel: () => void;
  onConfirm: (item: TMDBItem, choice: DiscoverAddChoice) => void;
}

const STATUSES: WatchStatus[] = ['plan', 'watching', 'watched'];
const defaultSectionFor = (item: TMDBItem) => (item.media_type === 'movie' ? 'General' : 'TV Series');

/**
 * Confirms how a Discover title goes into the list. Lets users log something they've already
 * watched: status, an optional watch date (left empty unless they set one), rating, platform.
 */
export function AddFromDiscoverDialog({ item, sections, region, myServices, onCancel, onConfirm }: Props) {
  const [status, setStatus] = useState<WatchStatus>('plan');
  const [watchedOn, setWatchedOn] = useState('');
  const [rating, setRating] = useState<number | undefined>();
  const [platform, setPlatform] = useState<WatchPlatform>('');
  const [section, setSection] = useState('General');
  const [platformTouched, setPlatformTouched] = useState(false);
  const [sectionTouched, setSectionTouched] = useState(false);
  const [suggested, setSuggested] = useState<string | null>(null);   // e.g. 'Marvel', from TMDB's production companies
  const [providers, setProviders] = useState<RegionProviders | undefined>();
  const [providersLoading, setProvidersLoading] = useState(false);
  const { ratings, loading: ratingsLoading } = useRatings(item?.media_type ?? 'movie', item?.id, !!item);

  // Fresh defaults each time a new title is opened.
  useEffect(() => {
    if (!item) return;
    setStatus('plan'); setWatchedOn(''); setRating(undefined); setPlatform(''); setPlatformTouched(false); setSectionTouched(false); setSuggested(null);
    setSection(defaultSectionFor(item));
    setProviders(undefined);
    let active = true;
    setProvidersLoading(true);
    // Same cached request the add uses afterwards for country/runtime/IMDb id.
    getDetails(item.media_type, item.id)
      .then((d) => {
        if (!active) return;
        setProviders(d['watch/providers']?.results?.[region]);
        setSuggested(suggestedSection(d));
      })
      .catch(() => {})
      .finally(() => { if (active) setProvidersLoading(false); });
    return () => { active = false; };
  }, [item, region]);

  // Pre-fill Platform with a service the user has (or the main streaming service) until they pick one.
  useEffect(() => {
    if (platformTouched) return;
    setPlatform(suggestPlatform(providers, myServices) ?? '');
  }, [providers, myServices, platformTouched]);

  if (!item) return null;
  const title = item.title ?? item.name ?? '';
  const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4);
  // Not out yet: it can only be planned. (You can't have watched it.)
  const unreleased = isUnreleased(item);
  // The user's own pick wins; otherwise a suggestion (Marvel) beats the media-type default.
  const chosenSection = sectionTouched ? section : suggested ?? section;
  const sectionOptions = [...new Set([...SECTIONS, ...sections])];

  const confirm = () => onConfirm(item, {
    status,
    watchedOn: status === 'watched' && watchedOn ? watchedOn : undefined,
    personalRating: status !== 'plan' ? rating : undefined,
    watchPlatform: platform || undefined,
    section: chosenSection,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <form onSubmit={(e) => { e.preventDefault(); confirm(); }}>
          <div className="flex gap-4 p-6 pb-2 pr-12">
            <div className="h-24 w-16 flex-shrink-0 overflow-hidden rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
              {item.poster_path
                ? <img src={`${TMDB_IMG}${item.poster_path}`} alt="" className="h-full w-full object-cover" />
                : <div className="flex h-full items-center justify-center"><Film className="h-6 w-6 opacity-30" /></div>}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg leading-tight">{title}</DialogTitle>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {[year, item.media_type === 'movie' ? 'Film' : 'Series'].filter(Boolean).join(' · ')}
              </p>
              {item.vote_average > 0 && (
                <p className="mt-1 inline-flex items-center gap-1 font-mono text-xs font-bold text-amber-400">
                  <Star className="h-3 w-3 fill-current" /> {item.vote_average.toFixed(1)}
                  <span className="font-sans text-[10px] tracking-widest opacity-70">TMDB</span>
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 px-6 py-3">
            <RatingsRow ratings={ratings} loading={ratingsLoading} tmdbFallback={item.vote_average || undefined} />

            <div className="grid gap-1.5">
              <Label>Where to watch</Label>
              <WhereToWatch providers={providers} region={region} myServices={myServices} loading={providersLoading} />
            </div>

            <div className="grid gap-1.5">
              <Label>Status</Label>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl p-1" style={{ background: 'var(--bg-elevated)' }} role="radiogroup" aria-label="Status">
                {STATUSES.map((s) => (
                  <button
                    key={s} type="button" role="radio" aria-checked={status === s}
                    disabled={unreleased && s !== 'plan'}
                    onClick={() => setStatus(s)}
                    className="rounded-lg px-2 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-30"
                    style={status === s ? STATUS_CONFIG[s].style : { color: 'var(--text-muted)', border: '1px solid transparent' }}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
              {unreleased && (
                <p className="text-xs" style={{ color: 'var(--accent-text)' }}>
                  Not out yet: releases {formatWatchDate(releaseDate(item))}. It will be added to Plan to Watch, and the Upcoming tab will remind you.
                </p>
              )}
            </div>

            {status === 'watched' && (
              <div className="grid gap-1.5">
                <Label>Watched on <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optional, a year is enough)</span></Label>
                <WatchDateField idPrefix="discover-watched" value={watchedOn || undefined} onChange={(v) => setWatchedOn(v ?? '')} />
              </div>
            )}

            {status !== 'plan' && (
              <div className="grid gap-1.5">
                <Label>My rating <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span></Label>
                <div className="grid grid-cols-10 gap-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                    const filled = rating != null && n <= rating;
                    return (
                      <button
                        key={n} type="button"
                        onClick={() => setRating(rating === n ? undefined : n)}
                        aria-label={`Rate ${n} out of 10`} aria-pressed={rating === n}
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
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Platform</Label>
                <Select value={platform || '_none'} onValueChange={(v) => { setPlatformTouched(true); setPlatform((v === '_none' ? '' : v) as WatchPlatform); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Section</Label>
                <Select value={chosenSection} onValueChange={(v) => { setSectionTouched(true); setSection(v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sectionOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" autoFocus>Add to list</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
