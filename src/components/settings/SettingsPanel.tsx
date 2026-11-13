import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion';
import { X, Download, Upload, FileJson, Sheet, GripVertical, LayoutGrid, Rows3, ListPlus, Bookmark } from 'lucide-react';
import type { Preferences } from '@/hooks/usePreferences';
import type { ViewMode } from '@/types';
import type { ExportFormat } from '@/hooks/useWatchlist';
import { SECTION_COLORS, SECTION_EMOJIS, PLATFORMS, cn } from '@/lib/utils';
import { defaultRegion } from '@/lib/titleData';
import { analyticsConfigured, analyticsPreference, browserOptedOut, setAnalyticsEnabled } from '@/lib/analytics';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const REGIONS = ['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'IN', 'BD', 'PK', 'SG', 'MY', 'ID', 'PH', 'TH', 'JP', 'KR',
  'AE', 'SA', 'TR', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'NO', 'DK', 'FI', 'PL', 'BR', 'MX', 'AR', 'ZA'];
const SERVICES = PLATFORMS.filter((p) => p !== 'Other');
const regionName = (code: string) => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; }
};

interface Props {
  open: boolean;
  onClose: () => void;
  prefs: Preferences;
  onPrefChange: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  sections: string[];                       // sections that have entries, in the user's order
  onReorderSections: (order: string[]) => void;
  entryCount: number;
  region: string;                           // effective region (saved or auto-detected)
  onExport: (format: ExportFormat) => void;
  onImport: () => void;
  onPasteList: () => void;
}

function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {description && <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-muted)' }}>{description}</span>}
      </span>
      <span
        className="relative h-5 w-9 flex-shrink-0 rounded-full transition-colors"
        style={{ background: checked ? 'var(--accent)' : 'var(--bg-hover)' }}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; onChange: (v: T) => void; label: string;
  options: { value: T; label: string; icon: React.ReactNode }[];
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
      <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
              value === o.value ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {o.icon}{o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionItem({ section }: { section: string }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={section} dragListener={false} dragControls={controls} className="list-none">
      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm" style={{ background: 'var(--bg-elevated)' }}>
        <span
          onPointerDown={(e) => controls.start(e)}
          className="cursor-grab touch-none p-1 active:cursor-grabbing"
          style={{ color: 'var(--text-muted)' }}
          aria-label={`Drag to reorder ${section}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <span>{SECTION_EMOJIS[section] ?? '🎬'}</span>
        <span className="truncate font-medium" style={{ color: SECTION_COLORS[section] ?? 'var(--text-secondary)' }}>{section}</span>
      </div>
    </Reorder.Item>
  );
}

const Heading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-1 mt-5 px-3 text-[10px] font-bold uppercase tracking-widest first:mt-0" style={{ color: 'var(--text-disabled)' }}>{children}</h3>
);

/** Right-side sheet (bottom sheet on mobile) with display preferences and data import/export. */
export function SettingsPanel(props: Props) {
  const { open, onClose, prefs, onPrefChange, view, onViewChange, sections, onReorderSections, entryCount, region, onExport, onImport, onPasteList } = props;
  const auto = defaultRegion();
  const regionOptions = [...new Set([auto, region, ...REGIONS])].sort((a, b) => regionName(a).localeCompare(regionName(b)));
  const toggleService = (svc: string) => onPrefChange('myServices',
    prefs.myServices.includes(svc) ? prefs.myServices.filter((s) => s !== svc) : [...prefs.myServices, svc]);
  const dataBtn = 'flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-hover)]';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={cn(
                  'fixed z-50 flex flex-col overflow-hidden border shadow-2xl focus:outline-none',
                  'inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl',
                  'sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[400px] sm:rounded-none sm:rounded-l-2xl',
                )}
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              >
                <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border-subtle)' }}>
                  <DialogPrimitive.Title className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Settings</DialogPrimitive.Title>
                  <DialogPrimitive.Close className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} aria-label="Close">
                    <X className="h-4 w-4" />
                  </DialogPrimitive.Close>
                </div>

                <div className="flex-1 overflow-y-auto px-2 py-4">
                  <Heading>Appearance</Heading>
                  <Segmented<ViewMode>
                    label="Layout" value={view} onChange={onViewChange}
                    options={[
                      { value: 'grid', label: 'Grid', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
                      { value: 'list', label: 'List', icon: <Rows3 className="h-3.5 w-3.5" /> },
                    ]}
                  />
                  {/* Mouse-only effect: pointless on phones and tablets. */}
                  <div className="touch:hidden">
                    <Switch label="Cursor glow" description="Soft spotlight that follows the mouse" checked={prefs.cursorGlow} onChange={(v) => onPrefChange('cursorGlow', v)} />
                  </div>

                  <Heading>Watchlist</Heading>
                  <Switch
                    label="Group by section"
                    description="Split the list into sections with headers"
                    checked={prefs.groupBySection} onChange={(v) => onPrefChange('groupBySection', v)}
                  />
                  <Switch
                    label="Section tag on cards"
                    description="Shown when the list isn't grouped"
                    checked={prefs.showSectionTag} onChange={(v) => onPrefChange('showSectionTag', v)}
                  />
                  <Switch
                    label="Runtime & notes on cards"
                    checked={prefs.showCardDetails} onChange={(v) => onPrefChange('showCardDetails', v)}
                  />

                  <Heading>Streaming</Heading>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Your country</span>
                    <Select value={prefs.region || '_auto'} onValueChange={(v) => onPrefChange('region', v === '_auto' ? '' : v)}>
                      <SelectTrigger className="h-8 w-auto gap-2 text-xs" aria-label="Your country"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_auto">Auto ({regionName(auto)})</SelectItem>
                        {regionOptions.map((r) => <SelectItem key={r} value={r}>{regionName(r)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="px-3 py-2">
                    <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Services you have</span>
                    <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-muted)' }}>Highlighted in "Where to watch" and used to pre-fill Platform.</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {SERVICES.map((svc) => {
                        const on = prefs.myServices.includes(svc);
                        return (
                          <button
                            key={svc} type="button" aria-pressed={on} onClick={() => toggleService(svc)}
                            className="rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors"
                            style={{
                              color: on ? 'var(--accent-green)' : 'var(--text-secondary)',
                              borderColor: on ? 'var(--accent-green)' : 'var(--border-subtle)',
                              background: on ? 'color-mix(in srgb, var(--accent-green) 12%, transparent)' : 'transparent',
                            }}
                          >
                            {on ? '✓ ' : ''}{svc}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {sections.length > 1 && (
                    <>
                      <Heading>Section order</Heading>
                      <p className="mb-2 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>Drag to reorder. Used when grouping by section and in the section filter.</p>
                      <Reorder.Group axis="y" values={sections} onReorder={onReorderSections} className="m-0 flex flex-col gap-1 px-3 p-0">
                        {sections.map((s) => <SectionItem key={s} section={s} />)}
                      </Reorder.Group>
                    </>
                  )}

                  <Heading>Data</Heading>
                  <div className="grid gap-2 px-3">
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Export your {entryCount} titles:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ['json', <FileJson key="i" className="h-4 w-4" />, 'Backup', 'JSON · restores everything'],
                        ['csv', <Sheet key="i" className="h-4 w-4" />, 'Spreadsheet', 'CSV · Excel, Sheets'],
                        ['letterboxd-watched', <Download key="i" className="h-4 w-4" />, 'Letterboxd diary', 'Watched films + ratings'],
                        ['letterboxd-watchlist', <Download key="i" className="h-4 w-4" />, 'Letterboxd watchlist', 'Films you plan to watch'],
                      ] as [ExportFormat, React.ReactNode, string, string][]).map(([format, icon, label, hint]) => (
                        <button
                          key={format}
                          onClick={() => onExport(format)}
                          className="flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{icon}{label}</span>
                          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{hint}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={onImport} className={dataBtn} style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
                      <Upload className="h-4 w-4" /> Import
                    </button>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Import accepts a CineTrack backup (.json) or spreadsheet (.csv), or your Letterboxd / IMDb export (.zip or .csv).
                    </p>
                  </div>

                  <Heading>Quick add</Heading>
                  <div className="grid gap-2 px-3">
                    <button onClick={onPasteList} className={dataBtn} style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
                      <ListPlus className="h-4 w-4" /> Paste a list of titles
                    </button>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Tip: paste an IMDb/TMDB link or a list anywhere in the app to add it. On Android, use
                      Share → CineTrack from the IMDb app.
                    </p>
                    <div className="touch:hidden">
                      <p className="mb-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        On a computer: drag this button to your bookmarks bar, then click it on any IMDb,
                        TMDB or Letterboxd page to add that title.
                      </p>
                      <BookmarkletLink />
                    </div>
                  </div>

                  <Heading>Privacy</Heading>
                  <p className="px-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    Your list stays in this browser. If you sign in with Google it is also stored in your own
                    cloud account so it syncs between devices.
                  </p>
                  <AnalyticsSwitch />
                  <p className="px-3 pt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-primary)]">
                      Read the full privacy note
                    </a>
                  </p>

                  <Heading>About</Heading>
                  {/* Attribution required by the TMDB API terms. */}
                  <p className="px-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    Posters and title data from{' '}
                    <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-primary)]">TMDB</a>.
                    This product uses the TMDB API but is not endorsed or certified by TMDB.
                    Streaming availability data by JustWatch. Ratings via MDBList / OMDb when configured.
                  </p>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

/**
 * "+ CineTrack" bookmarklet: opens the app with the current page's URL and title, which the
 * share-target handling turns into an add dialog. The href is set after mount because React
 * warns about javascript: URLs in JSX.
 */
function BookmarkletLink() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const code = `(()=>{window.open('${window.location.origin}/?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank')})()`;
    ref.current?.setAttribute('href', `javascript:${code}`);
  }, []);
  return (
    <a
      ref={ref}
      onClick={(e) => e.preventDefault()}
      draggable
      className="inline-flex cursor-grab items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold active:cursor-grabbing"
      style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
      title="Drag me to your bookmarks bar"
    >
      <Bookmark className="h-3.5 w-3.5" /> + CineTrack
    </a>
  );
}

const PRIVACY_URL = 'https://github.com/isttiiak/CineTrack/blob/main/PRIVACY.md';

/** Opt-out for anonymous usage statistics; explains when nothing is collected anyway. */
function AnalyticsSwitch() {
  const [on, setOn] = useState(analyticsPreference);
  if (!analyticsConfigured) {
    return <p className="px-3 pt-2 text-xs" style={{ color: 'var(--text-muted)' }}>This copy of the app doesn't collect usage statistics.</p>;
  }
  const blocked = browserOptedOut();
  return (
    <Switch
      label="Share anonymous usage statistics"
      description={blocked
        ? 'Off: your browser sends Do Not Track, so nothing is collected.'
        : 'Which features get used: never titles, notes or links.'}
      checked={on && !blocked}
      onChange={(v) => { setOn(v); setAnalyticsEnabled(v); }}
    />
  );
}
