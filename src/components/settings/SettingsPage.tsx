import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, Reorder, useDragControls } from 'framer-motion';
import {
  ArrowLeft, Download, Upload, FileJson, Sheet, GripVertical, LayoutGrid, Rows3, ListPlus, Bookmark, Palette, Tv,
  Database, ShieldCheck, Smartphone, Trash2, Info, CheckSquare, Share, Plus, WifiOff, RefreshCw, Eraser,
} from 'lucide-react';
import type { Preferences } from '@/hooks/usePreferences';
import type { UserProfile, ViewMode } from '@/types';
import type { ExportFormat } from '@/hooks/useWatchlist';
import { SECTION_COLORS, SECTION_EMOJIS, PLATFORMS, cn } from '@/lib/utils';
import { defaultRegion } from '@/lib/titleData';
import { analyticsConfigured, analyticsPreference, browserOptedOut, setAnalyticsEnabled } from '@/lib/analytics';
import { awaitingConsent, consentRequirement, useConsentVersion } from '@/lib/consent';
import { isIos, isStandalone, promptInstall, reloadForUpdate, resetOfflineCache, useOnline, usePwa } from '@/lib/pwa';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TypeConfirmDialog } from '@/components/ui/type-confirm-dialog';
import { Button } from '@/components/ui/button';

const REGIONS = ['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'IN', 'BD', 'PK', 'SG', 'MY', 'ID', 'PH', 'TH', 'JP', 'KR',
  'AE', 'SA', 'TR', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'NO', 'DK', 'FI', 'PL', 'BR', 'MX', 'AR', 'ZA'];
const SERVICES = PLATFORMS.filter((p) => p !== 'Other');
const regionName = (code: string) => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; }
};

const PRIVACY_URL = 'https://github.com/isttiiak/CineTrack/blob/main/PRIVACY.md';
const REPO_URL = 'https://github.com/isttiiak/CineTrack';

type TabId = 'display' | 'streaming' | 'data' | 'privacy' | 'app' | 'delete' | 'about';
const TABS: { id: TabId; label: string; icon: typeof Palette; danger?: boolean }[] = [
  { id: 'display', label: 'Display', icon: Palette },
  { id: 'streaming', label: 'Streaming', icon: Tv },
  { id: 'data', label: 'Import & export', icon: Database },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'app', label: 'App & offline', icon: Smartphone },
  { id: 'delete', label: 'Delete data', icon: Trash2, danger: true },
  { id: 'about', label: 'About', icon: Info },
];

export interface SettingsPageProps {
  onClose: () => void;
  prefs: Preferences;
  onPrefChange: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  onResetPrefs: () => void;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  sections: string[];                       // sections that have entries, in the user's order
  onReorderSections: (order: string[]) => void;
  entryCount: number;
  region: string;                           // effective region (saved or auto-detected)
  user: UserProfile | null;
  onExport: (format: ExportFormat) => void;
  onImport: () => void;
  onPasteList: () => void;
  /** Leaves Settings and turns on multi-select on the watchlist. */
  onSelectToDelete: () => void;
  onDeleteAllTitles: () => void;
  /** Guests: erases the list, settings, caches and cookies of this browser, then reloads. */
  onEraseThisBrowser: () => Promise<void>;
  /** Signed in: deletes cloud data, the sign-in record and local data. Resolves with an error message, or null on success. */
  onDeleteAccount: () => Promise<string | null>;
}

// ── Small building blocks ────────────────────────────────────────────────────

function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {description && <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-muted)' }}>{description}</span>}
      </span>
      <span className="relative h-5 w-9 flex-shrink-0 rounded-full transition-colors" style={{ background: checked ? 'var(--accent)' : 'var(--bg-hover)' }}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; onChange: (v: T) => void; label: string;
  options: { value: T; label: string; icon: ReactNode }[];
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
      <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              value === o.value ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}
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
      <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm" style={{ background: 'var(--bg-elevated)' }}>
        <span onPointerDown={(e) => controls.start(e)} className="cursor-grab touch-none p-1 active:cursor-grabbing" style={{ color: 'var(--text-muted)' }} aria-label={`Drag to reorder ${section}`}>
          <GripVertical className="h-4 w-4" />
        </span>
        <span>{SECTION_EMOJIS[section] ?? '🎬'}</span>
        <span className="truncate font-medium" style={{ color: SECTION_COLORS[section] ?? 'var(--text-secondary)' }}>{section}</span>
      </div>
    </Reorder.Item>
  );
}

const cardStyle = { background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' } as const;

function Card({ title, description, children, danger }: { title?: string; description?: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <section className="mb-4 rounded-2xl border p-2 sm:p-3" style={danger ? { ...cardStyle, borderColor: 'rgb(239 68 68 / 0.3)' } : cardStyle}>
      {(title || description) && (
        <header className="px-3 pb-1 pt-2">
          {title && <h2 className="text-sm font-bold" style={{ color: danger ? '#f87171' : 'var(--text-primary)' }}>{title}</h2>}
          {description && <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

const outlineBtn = 'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50';

// ── Page ─────────────────────────────────────────────────────────────────────

/** Full-page settings: a side menu (chips on phones) and one focused group of options at a time. */
export function SettingsPage(props: SettingsPageProps) {
  const { onClose } = props;
  const [tab, setTab] = useState<TabId>('display');
  const [dialog, setDialog] = useState<null | 'all' | 'account' | 'browser'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Esc leaves the page, unless a dialog or dropdown is open (they close themselves first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="listbox"], [role="menu"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choose = (id: TabId) => { setTab(id); scroller.current?.scrollTo({ top: 0 }); };
  const closeDialog = () => { if (!busy) { setDialog(null); setError(null); } };

  const runDelete = async (task: () => Promise<string | null | void>) => {
    setBusy(true); setError(null);
    try {
      const failure = await task();
      if (failure) setError(failure); else setDialog(null);
    } catch {
      setError('Something went wrong. Nothing was deleted that you can’t retry; check your connection and try again.');
    } finally { setBusy(false); }
  };

  const { user, entryCount } = props;
  const titles = `${entryCount} title${entryCount === 1 ? '' : 's'}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.22 }}
      className="fixed inset-0 z-40 overflow-y-auto" style={{ background: 'var(--bg-base)' }}
      ref={scroller} role="region" aria-label="Settings"
    >
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-5 sm:pt-8">
        <div className="mb-5 flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 rounded-xl p-2 text-sm font-medium transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} aria-label="Back to your list">
            <ArrowLeft className="h-5 w-5" /><span className="hidden sm:inline">Back</span>
          </button>
          <h1 className="text-xl font-bold sm:text-2xl" style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>Settings</h1>
        </div>

        <div className="md:grid md:grid-cols-[210px_minmax(0,1fr)] md:gap-8">
          <nav aria-label="Settings sections" className="mb-5 md:mb-0">
            <ul className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:sticky md:top-6 md:mx-0 md:flex-col md:overflow-visible md:px-0">
              {TABS.map(({ id, label, icon: Icon, danger }) => {
                const on = tab === id;
                return (
                  <li key={id} className="flex-shrink-0">
                    <button
                      onClick={() => choose(id)} aria-current={on ? 'page' : undefined}
                      className={cn('flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                        on ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-hover)]')}
                      style={{
                        color: danger ? '#f87171' : on ? 'var(--text-primary)' : 'var(--text-muted)',
                        boxShadow: on ? '0 0 0 1px var(--border-subtle)' : 'none',
                      }}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />{label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-w-0">
            {tab === 'display' && <DisplayTab {...props} />}
            {tab === 'streaming' && <StreamingTab {...props} />}
            {tab === 'data' && <DataTab {...props} />}
            {tab === 'privacy' && <PrivacyTab />}
            {tab === 'app' && <AppTab />}
            {tab === 'delete' && <DeleteTab {...props} onAsk={setDialog} />}
            {tab === 'about' && <AboutTab />}
          </div>
        </div>
      </div>

      <TypeConfirmDialog
        open={dialog === 'all'}
        title="Delete all titles?"
        items={[`All ${titles} in your list, with their statuses, ratings, notes, dates and links`, user ? 'On every device you are signed in on, once it syncs' : 'Your settings are kept']}
        confirmLabel="Delete all titles"
        busy={busy} error={error}
        onBackup={() => props.onExport('json')}
        onCancel={closeDialog}
        onConfirm={() => runDelete(async () => { props.onDeleteAllTitles(); return null; })}
      />
      <TypeConfirmDialog
        open={dialog === 'browser'}
        title="Erase everything in this browser?"
        items={[`Your list (${titles})`, 'Your display settings and streaming services', 'Offline copy, cached posters and the analytics cookie', 'The app then reloads as an empty list']}
        confirmLabel="Erase everything"
        busy={busy} error={error}
        onBackup={() => props.onExport('json')}
        onCancel={closeDialog}
        onConfirm={() => runDelete(async () => { await props.onEraseThisBrowser(); return null; })}
      />
      <TypeConfirmDialog
        open={dialog === 'account'}
        title="Delete your account and all data?"
        items={[
          `Your list (${titles}) in the cloud, with everything saved on it`,
          'Your profile record and your sign-in record (name, email address, photo link)',
          'Everything CineTrack stored on this device: list, settings, offline copy, cookies',
          'Other devices keep nothing once they sync or are signed out',
        ]}
        confirmLabel="Delete my account"
        busy={busy} error={error}
        onBackup={() => props.onExport('json')}
        onCancel={closeDialog}
        onConfirm={() => runDelete(props.onDeleteAccount)}
      />
    </motion.div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function DisplayTab({ prefs, onPrefChange, onResetPrefs, view, onViewChange, sections, onReorderSections }: SettingsPageProps) {
  return (
    <>
      <Card title="Appearance">
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
      </Card>

      <Card title="Watchlist">
        <Switch label="Group by section" description="Split the list into sections with headers" checked={prefs.groupBySection} onChange={(v) => onPrefChange('groupBySection', v)} />
        <Switch label="Section tag on cards" description="Shown when the list isn't grouped" checked={prefs.showSectionTag} onChange={(v) => onPrefChange('showSectionTag', v)} />
        <Switch label="Runtime & notes on cards" checked={prefs.showCardDetails} onChange={(v) => onPrefChange('showCardDetails', v)} />
      </Card>

      {sections.length > 1 && (
        <Card title="Section order" description="Drag to reorder. Used when grouping by section and in the section filter.">
          <Reorder.Group axis="y" values={sections} onReorder={onReorderSections} className="m-0 flex flex-col gap-1 p-3">
            {sections.map((s) => <SectionItem key={s} section={s} />)}
          </Reorder.Group>
        </Card>
      )}

      <div className="px-1">
        <Button variant="outline" onClick={onResetPrefs}>Reset display settings</Button>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>Puts layout, toggles, country and services back to their defaults. Your list is not touched.</p>
      </div>
    </>
  );
}

function StreamingTab({ prefs, onPrefChange, region }: SettingsPageProps) {
  const auto = defaultRegion();
  const regionOptions = [...new Set([auto, region, ...REGIONS])].sort((a, b) => regionName(a).localeCompare(regionName(b)));
  const toggleService = (svc: string) => onPrefChange('myServices',
    prefs.myServices.includes(svc) ? prefs.myServices.filter((s) => s !== svc) : [...prefs.myServices, svc]);
  return (
    <>
      <Card title="Your country" description="Decides which streaming services “Where to watch” shows.">
        <div className="flex items-center justify-between gap-3 px-3 py-3">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Country</span>
          <Select value={prefs.region || '_auto'} onValueChange={(v) => onPrefChange('region', v === '_auto' ? '' : v)}>
            <SelectTrigger className="h-9 w-auto gap-2 text-sm" aria-label="Your country"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_auto">Auto ({regionName(auto)})</SelectItem>
              {regionOptions.map((r) => <SelectItem key={r} value={r}>{regionName(r)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>
      <Card title="Services you have" description="Highlighted in “Where to watch” and used to pre-fill Platform when you add a title.">
        <div className="flex flex-wrap gap-2 p-3">
          {SERVICES.map((svc) => {
            const on = prefs.myServices.includes(svc);
            return (
              <button
                key={svc} type="button" aria-pressed={on} onClick={() => toggleService(svc)}
                className="rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors"
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
      </Card>
    </>
  );
}

function DataTab({ entryCount, onExport, onImport, onPasteList }: SettingsPageProps) {
  return (
    <>
      <Card title="Export" description={`Download your ${entryCount} titles.`}>
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          {([
            ['json', <FileJson key="i" className="h-4 w-4" />, 'Backup', 'JSON · restores everything'],
            ['csv', <Sheet key="i" className="h-4 w-4" />, 'Spreadsheet', 'CSV · Excel, Sheets'],
            ['letterboxd-watched', <Download key="i" className="h-4 w-4" />, 'Letterboxd diary', 'Watched films + ratings'],
            ['letterboxd-watchlist', <Download key="i" className="h-4 w-4" />, 'Letterboxd watchlist', 'Films you plan to watch'],
          ] as [ExportFormat, ReactNode, string, string][]).map(([format, icon, label, hint]) => (
            <button
              key={format} onClick={() => onExport(format)}
              className="flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{icon}{label}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Import" description="Accepts a CineTrack backup (.json) or spreadsheet (.csv), or your Letterboxd / IMDb export (.zip or .csv).">
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          <button onClick={onImport} className={outlineBtn} style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}><Upload className="h-4 w-4" /> Import a file</button>
          <button onClick={onPasteList} className={outlineBtn} style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}><ListPlus className="h-4 w-4" /> Paste a list of titles</button>
        </div>
      </Card>

      <Card
        title="Quick add"
        description="Three more ways to add a title without typing it."
      >
        <ul className="space-y-3 px-3 pb-3 pt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li>
            <b style={{ color: 'var(--text-primary)' }}>Paste anywhere.</b> Copy an IMDb or TMDB link (or a list, one title per line) and press Ctrl/⌘+V on any CineTrack screen.
          </li>
          <li>
            <b style={{ color: 'var(--text-primary)' }}>Android share.</b> Install the app, then in the IMDb app choose Share → CineTrack.
          </li>
          <li className="touch:hidden">
            <b style={{ color: 'var(--text-primary)' }}>Bookmarklet (computer).</b>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <li>Show your bookmarks bar (Ctrl/⌘+Shift+B in Chrome, Edge and Firefox).</li>
              <li>Drag the button below onto the bar.</li>
              <li>On an IMDb, TMDB or Letterboxd title page, click it. CineTrack opens in a new tab with that title ready to add.</li>
            </ol>
            <div className="mt-2"><BookmarkletLink /></div>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              The bookmark points at this address ({window.location.origin}). Create it on the site you actually use. If a site
              blocks bookmarklets, copy its address and paste it into CineTrack instead.
            </p>
          </li>
        </ul>
      </Card>
    </>
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
      className="inline-flex cursor-grab items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold active:cursor-grabbing"
      style={{ borderColor: 'var(--accent)', color: 'var(--accent-text)' }}
      title="Drag me to your bookmarks bar"
    >
      <Bookmark className="h-4 w-4" /> + CineTrack
    </a>
  );
}

function PrivacyTab() {
  useConsentVersion();                    // re-render when the banner or region detection changes the answer
  const on = analyticsPreference();
  const blocked = browserOptedOut();
  const optIn = consentRequirement() === 'required';
  return (
    <>
      <Card title="Your data" description="Your list stays in this browser. If you sign in with Google it is also stored in your own cloud account so it syncs between devices. Nothing is sold or shared.">
        <p className="px-3 pb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-primary)]">Read the full privacy note</a>
        </p>
      </Card>
      <Card title="Usage statistics">
        {!analyticsConfigured ? (
          <p className="px-3 pb-3 text-sm" style={{ color: 'var(--text-secondary)' }}>This copy of the app doesn't collect usage statistics.</p>
        ) : (
          <>
            <Switch
              label="Share anonymous usage statistics"
              description={blocked
                ? 'Off: your browser sends Do Not Track, so nothing is collected.'
                : optIn
                  ? awaitingConsent()
                    ? 'Off until you allow it (asked in the banner). Which features get used: never titles, notes or links.'
                    : 'You are in a region that needs your consent. Which features get used: never titles, notes or links.'
                  : 'Which features get used: never titles, notes or links.'}
              checked={on && !blocked}
              disabled={blocked}
              onChange={setAnalyticsEnabled}
            />
            <p className="px-3 pb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              Uses Google Analytics and a random identifier cookie. Turning it off stops collection and removes that cookie.
            </p>
          </>
        )}
      </Card>
    </>
  );
}

function AppTab() {
  const online = useOnline();
  const { canInstall, installed, updateReady } = usePwa();
  const [msg, setMsg] = useState<string | null>(null);
  const standalone = isStandalone();
  const ios = isIos();

  return (
    <>
      <Card title="Install CineTrack" description="Opens like a normal app from your home screen or dock, works offline, and on Android it appears in the Share menu.">
        <div className="p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {standalone || installed ? (
            <p className="flex items-center gap-2"><CheckSquare className="h-4 w-4 text-emerald-400" /> CineTrack is installed on this device.</p>
          ) : canInstall ? (
            <Button onClick={() => { void promptInstall().then((ok) => setMsg(ok ? 'Installing…' : null)); }}><Download className="h-4 w-4" /> Install app</Button>
          ) : ios ? (
            <ol className="space-y-2">
              <li className="flex items-start gap-2"><span className="font-mono text-xs opacity-60">1</span><span>Open this page in <b>Safari</b> and tap the Share button <Share className="inline h-4 w-4 align-text-bottom" />.</span></li>
              <li className="flex items-start gap-2"><span className="font-mono text-xs opacity-60">2</span><span>Choose <b>Add to Home Screen</b> <Plus className="inline h-4 w-4 align-text-bottom" />, then <b>Add</b>.</span></li>
            </ol>
          ) : (
            <p>Use your browser's menu: <b>Install app</b> / <b>Add to Home screen</b> (Chrome, Edge) or the install icon in the address bar. Not offered yet? The browser decides when; use the site for a bit and check again. It works only on the live HTTPS site, not in a development server.</p>
          )}
          {msg && <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{msg}</p>}
        </div>
      </Card>

      <Card title="Offline">
        <div className="space-y-3 p-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <p className="flex items-center gap-2">
            {online ? <><span className="h-2 w-2 rounded-full bg-emerald-400" /> Online</> : <><WifiOff className="h-4 w-4 text-amber-400" /> Offline: working from this device</>}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Your list, the app itself and posters you have seen are available without a connection. Discover, ratings and
            sign-in need one. Changes made offline sync when you're back.
          </p>
          <div className="flex flex-wrap gap-2">
            {updateReady && <Button onClick={reloadForUpdate}><RefreshCw className="h-4 w-4" /> Update now</Button>}
            <button
              className={outlineBtn} style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              onClick={() => { void resetOfflineCache().then(() => window.location.reload()); }}
            >
              <Eraser className="h-4 w-4" /> Clear offline cache &amp; reload
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Fixes a stuck or outdated copy of the app. Your list is not affected.</p>
        </div>
      </Card>
    </>
  );
}

function DeleteTab({ user, entryCount, onSelectToDelete, onAsk }: SettingsPageProps & { onAsk: (d: 'all' | 'account' | 'browser') => void }) {
  const row = 'flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between';
  const danger = 'inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40 disabled:hover:bg-transparent';
  const text = (title: string, body: ReactNode) => (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{body}</p>
    </div>
  );
  return (
    <>
      <Card title="Titles" description="Take a backup first (Import & export) if you might want them back.">
        <div className={row}>
          {text('Delete selected titles', 'Pick titles on your watchlist, then choose Delete in the bar at the bottom.')}
          <button onClick={onSelectToDelete} disabled={entryCount === 0} className={danger}><CheckSquare className="h-4 w-4" /> Select titles…</button>
        </div>
        <div className="mx-3 h-px" style={{ background: 'var(--border-subtle)' }} />
        <div className={row}>
          {text('Delete all titles', user ? 'Empties your list but keeps your account and settings. The empty list syncs to your other devices.' : 'Empties your list but keeps your settings.')}
          <button onClick={() => onAsk('all')} disabled={entryCount === 0} className={danger}><Trash2 className="h-4 w-4" /> Delete all {entryCount}</button>
        </div>
      </Card>

      <Card danger title={user ? 'Account' : 'This browser'}>
        <div className={row}>
          {user
            ? text('Delete account and all data', <>Permanently removes your list and profile from the cloud, your sign-in record (name, email, photo link) and everything stored on this device. Google may ask you to sign in again first. Anonymous usage statistics can't be traced to you, so there is nothing to delete there.</>)
            : text('Erase everything in this browser', 'Removes your list, display settings, offline copy and the analytics cookie from this browser, and starts again with an empty list. As a guest, this is the only copy, so it can’t be recovered.')}
          <button onClick={() => onAsk(user ? 'account' : 'browser')} className={cn(danger, 'bg-red-500/10')}>
            <Trash2 className="h-4 w-4" /> {user ? 'Delete account…' : 'Erase everything…'}
          </button>
        </div>
      </Card>
    </>
  );
}

function AboutTab() {
  return (
    <Card title="About CineTrack">
      {/* Attribution required by the TMDB API terms. */}
      <div className="space-y-3 p-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        <p>
          Posters and title data from{' '}
          <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-primary)]">TMDB</a>.
          This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data by JustWatch.
          Ratings via MDBList / OMDb when configured.
        </p>
        <p>
          Open source:{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-primary)]">github.com/isttiiak/CineTrack</a>
          {' · '}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-primary)]">Privacy</a>
        </p>
        <p className="font-mono text-xs">Version {__APP_VERSION__}</p>
      </div>
    </Card>
  );
}
