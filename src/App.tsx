import { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, ArrowUp, Compass, List, CheckSquare, LayoutGrid, Rows3, CalendarClock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { saveUserProfile } from '@/lib/firestore';
import { track } from '@/lib/analytics';
import { useWatchlist, type ImportMode, type ExportFormat } from '@/hooks/useWatchlist';
import { useToast } from '@/hooks/useToast';
import { useCursorGlow } from '@/hooks/useCursorGlow';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { usePreferences } from '@/hooks/usePreferences';
import { Header } from '@/components/layout/Header';
import { PwaStatus } from '@/components/layout/PwaStatus';
import { ConsentBanner } from '@/components/layout/ConsentBanner';
import { AuthBanner } from '@/components/auth/AuthBanner';
import { FilterBar } from '@/components/filters/FilterBar';
import { SearchBox } from '@/components/filters/SearchBox';
import { parseQuery, searchEntries, freeText } from '@/lib/search';
import { EntryCard } from '@/components/watchlist/EntryCard';
import { EntryRow } from '@/components/watchlist/EntryRow';
import { EntryDrawer } from '@/components/watchlist/EntryDrawer';
import { AddModal } from '@/components/watchlist/AddModal';
import { BulkActionBar } from '@/components/ui/bulk-action-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ImportDialog } from '@/components/ui/import-dialog';
import type { ImportSource } from '@/components/import/ExternalImportDialog';
import { ToastContainer } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { SECTION_COLORS, SECTION_EMOJIS, cn } from '@/lib/utils';
import { wipeLocalDataAndReload } from '@/lib/localData';
import { defaultRegion } from '@/lib/titleData';
import { parseTitleLink, sharedTextFrom } from '@/lib/links';
import { countryOptions, hasCountry } from '@/lib/countries';
import type { FilterState, MovieEntry, WatchMeta, WatchStatus, ViewMode, WatchlistState } from '@/types';

// Code-split: these load when first needed, which keeps the first paint small.
const SettingsPage = lazy(() => import('@/components/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProfilePage = lazy(() => import('@/components/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const DiscoverPage = lazy(() => import('@/components/discover/DiscoverPage').then((m) => ({ default: m.DiscoverPage })));
const UpcomingPage = lazy(() => import('@/components/upcoming/UpcomingPage').then((m) => ({ default: m.UpcomingPage })));
const ExternalImportDialog = lazy(() => import('@/components/import/ExternalImportDialog').then((m) => ({ default: m.ExternalImportDialog })));

function PageLoading() {
  return <div className="py-20 text-center text-sm" style={{ color: 'var(--text-muted)' }} role="status">Loading…</div>;
}

type Tab = 'watchlist' | 'discover' | 'upcoming';

const EMPTY_FILTERS: FilterState = { query: '', section: '', country: '', type: '', status: '', platform: '', sort: '' };
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;          // CineTrack JSON backups
const MAX_EXTERNAL_IMPORT_BYTES = 25 * 1024 * 1024; // Letterboxd .zip / IMDb .csv exports

const num = (v: string, fallback: number) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };
// '' (default) is "Recently added": newest first, handled separately because it needs insertion order.
const SORTERS: Record<string, (a: MovieEntry, b: MovieEntry) => number> = {
  title_asc:  (a, b) => a.title.localeCompare(b.title),
  title_desc: (a, b) => b.title.localeCompare(a.title),
  year_desc:  (a, b) => num(b.year, 0) - num(a.year, 0),
  year_asc:   (a, b) => num(a.year, 9999) - num(b.year, 9999),
  imdb_desc:  (a, b) => num(b.imdbRating, -1) - num(a.imdbRating, -1),
  imdb_asc:   (a, b) => num(a.imdbRating, 99) - num(b.imdbRating, 99),
};

export default function App() {
  const { user, loading, signIn, signOut, confirmRecentSignIn, deleteAccount } = useAuth();
  const uid = user?.uid ?? null;
  const {
    state, initialised, cloudError, retrySync,
    addEntry, updateEntry, deleteEntries, deleteAllEntries, eraseCloudData,
    setStatus, setStatuses, moveToSection, setMeta, setProgress, reorderSections, updatePoster,
    exportData, parseImport, applyImport, forceSync,
    flush, lastSync, syncStatus,
  } = useWatchlist(uid);

  const { toasts, addToast, removeToast } = useToast();
  const { glowRef, pulse } = useCursorGlow();
  const [view, setView] = useLocalStorage<ViewMode>('cinetrack_view', 'grid');
  const { prefs, setPref, resetPrefs } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [shareIntent, setShareIntent] = useState(false);
  const [discoverStart, setDiscoverStart] = useState<'trending' | 'soon'>('trending');
  const region = prefs.region || defaultRegion();
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<MovieEntry | null>(null);
  const [editMeta, setEditMeta] = useState<WatchMeta | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [pendingImport, setPendingImport] = useState<WatchlistState | null>(null);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  const openPasteList = useCallback((text = '') => { setModalOpen(false); setSettingsOpen(false); setImportSource({ kind: 'text', text }); }, []);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('watchlist');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const importRef = useRef<HTMLInputElement>(null);
  // The import dialog loads on first use and stays mounted afterwards so its close animation still plays.
  const importSeen = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) saveUserProfile(user).catch(() => {});
  }, [user]);

  // Android "Share → CineTrack" (Web Share Target) and plain ?url= links open Discover with the
  // shared title; an IMDb/TMDB link opens its add dialog straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // App shortcuts (manifest.json) open a tab directly: /?tab=discover
    const tab = params.get('tab');
    if (tab === 'discover' || tab === 'upcoming') {
      window.history.replaceState(null, '', window.location.pathname);
      setActiveTab(tab);
      return;
    }
    const shared = sharedTextFrom(params);
    if (!shared) return;
    window.history.replaceState(null, '', window.location.pathname);
    setActiveTab('discover');
    setDiscoverQuery(shared);
    setShareIntent(true);
  }, []);

  // Paste anywhere (outside a text field): an IMDb/TMDB link opens that title ready to add; a list
  // of several lines opens "Add a list of titles" with it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const text = e.clipboardData?.getData('text')?.trim();
      if (!text) return;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length >= 2) { e.preventDefault(); openPasteList(text); return; }
      if (parseTitleLink(text)) {
        e.preventDefault();
        setActiveTab('discover'); setDiscoverQuery(text); setShareIntent(true);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [openPasteList]);

  // "/" or ⌘K / Ctrl+K focuses the search box (unless the user is typing somewhere else).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (cmdK || (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        if (activeTab === 'upcoming') setActiveTab('watchlist');
        requestAnimationFrame(() => { searchRef.current?.focus(); searchRef.current?.select(); });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab]);

  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // ── Auth ────────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    try {
      if (await signIn()) { addToast('Signed in — syncing your list', 'success'); track('sign_in'); }
    } catch {
      addToast('Sign-in failed. Check pop-up blockers and try again.', 'error');
    }
  };

  const handleSignOut = async () => {
    // Push queued edits while we are still authenticated; afterwards the rules reject the write.
    await flush();
    try {
      track('sign_out');
      await signOut();
      setDrawerId(null);
      addToast('Signed out', 'info');
    } catch {
      addToast('Sign-out failed', 'error');
    }
  };

  // ── Entry actions ───────────────────────────────────────────────────────
  const openAdd = () => { setEditEntry(null); setEditMeta(null); setModalOpen(true); };
  const openEdit = useCallback((entry: MovieEntry) => {
    setDrawerId(null);
    setEditEntry(entry);
    setEditMeta(state.meta[entry.id] ?? { id: entry.id, status: 'plan' });
    setModalOpen(true);
  }, [state.meta]);

  const handleSave = (entryData: Omit<MovieEntry, 'id' | 'isCustom'>, metaData: Partial<WatchMeta>) => {
    const before = editMeta ?? undefined;
    if (editEntry) {
      updateEntry(editEntry.id, entryData, metaData);
      addToast('Entry updated', 'success');
      track('watchlist_entry_edited');
    } else {
      addEntry(entryData, metaData);
      addToast('Entry added', 'success');
      track('watchlist_entry_added', { source: 'manual', type: entryData.type });
    }
    if (metaData.personalRating != null && metaData.personalRating !== before?.personalRating) track('personal_rating_set', { rating: metaData.personalRating });
    if (metaData.notes && metaData.notes !== before?.notes) track('notes_saved');
    if (metaData.watchPlatform && metaData.watchPlatform !== before?.watchPlatform) track('platform_set', { platform: metaData.watchPlatform });
    pulse();
  };

  const handleStatus = (id: string, s: WatchStatus) => {
    track('status_changed', { from: state.meta[id]?.status ?? 'plan', to: s });
    setStatus(id, s);
    pulse();
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteEntries(pendingDelete);
    track('watchlist_entry_deleted', { count: pendingDelete.length });
    addToast(pendingDelete.length === 1 ? 'Entry deleted' : `${pendingDelete.length} entries deleted`, 'info');
    if (drawerId && pendingDelete.includes(drawerId)) setDrawerId(null);
    setSelectedIds(new Set());
    setPendingDelete(null);
    pulse();
  };

  // ── Deleting data (Settings → Delete data) ──────────────────────────────
  const handleSelectToDelete = () => {
    setSettingsOpen(false);
    setActiveTab('watchlist');
    setSelectMode(true);
    addToast('Tap the titles to delete, then choose Delete', 'info');
  };

  const handleDeleteAll = () => {
    const n = deleteAllEntries();
    track('watchlist_entry_deleted', { count: n });
    setDrawerId(null);
    exitSelect();
    addToast(`${n} ${n === 1 ? 'title' : 'titles'} deleted`, 'info');
    pulse();
  };

  /** Resolves with a message to show when something went wrong (nothing is left half-deleted that can't be retried). */
  const handleDeleteAccount = async (): Promise<string | null> => {
    try {
      // Google first: the sign-in must be recent, and nothing should be deleted if that fails.
      if (await confirmRecentSignIn() === 'resign') {
        return 'For security, Google needs a fresh sign-in first. Sign out, sign in again, then delete your account right away.';
      }
      await eraseCloudData();       // list + profile in Firestore (sync is halted so nothing recreates them)
      await deleteAccount();        // the sign-in record
      await wipeLocalDataAndReload('everything');
      return null;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Cancelled. Nothing was deleted.';
      if (code === 'auth/requires-recent-login') return 'Your list and profile are deleted, but Google needs a fresh sign-in to remove the account itself. Sign out, sign in again and delete the account once more.';
      if ((err as Error).message === 'offline' || code === 'unavailable') return 'You are offline. Nothing was deleted; try again when you are connected.';
      console.error('Account deletion failed:', err);
      return 'Something went wrong and the account could not be fully deleted. Check your connection and try again; deleting again is safe.';
    }
  };

  // ── Import / export / sync ──────────────────────────────────────────────
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Letterboxd / IMDb exports go through matching + review; JSON is a CineTrack backup.
    if (/\.(csv|zip)$/i.test(file.name)) {
      if (file.size > MAX_EXTERNAL_IMPORT_BYTES) { addToast('File is too large (max 25 MB)', 'error'); return; }
      setImportSource({ kind: 'file', file });
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) { addToast('File is too large (max 5 MB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseImport(String(reader.result ?? ''));
      if (parsed) setPendingImport(parsed);
      else addToast('Not a valid CineTrack export', 'error');
    };
    reader.onerror = () => addToast('Could not read file', 'error');
    reader.readAsText(file);
  };

  const handleImportChoice = (mode: ImportMode) => {
    if (!pendingImport) return;
    const res = applyImport(pendingImport, mode);
    setPendingImport(null);
    track('import_json', { mode, added: res.added });
    if (mode === 'replace') addToast(`Replaced list with ${res.added} titles`, 'success');
    else addToast(res.added ? `Imported ${res.added} new${res.skipped ? `, skipped ${res.skipped} duplicates` : ''}` : 'Nothing new — all titles already in your list', res.added ? 'success' : 'info');
    if (res.added) pulse();
  };

  const handleExport = (format: ExportFormat = 'json') => {
    const n = exportData(format);
    const what = { json: 'Backup', csv: 'Spreadsheet', 'letterboxd-watched': 'Letterboxd diary', 'letterboxd-watchlist': 'Letterboxd watchlist' }[format];
    if (format.startsWith('letterboxd')) {
      addToast(n ? `${what} saved (${n} films) — import it at letterboxd.com/import` : 'No films to export for Letterboxd (it only tracks films)', n ? 'success' : 'info');
    } else addToast(`${what} saved (${n} titles)`, 'success');
    track('export_json', { format });
  };

  const handleForceSync = async () => {
    try {
      await forceSync();
      addToast('Synced to cloud!', 'success');
    } catch {
      addToast('Sync failed — check connection', 'error');
    }
  };

  // ── Selection ───────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const handleBulkMove = (section: string) => {
    const n = selectedIds.size;
    moveToSection([...selectedIds], section);
    addToast(`${n} ${n === 1 ? 'title' : 'titles'} moved to ${section}`, 'success');
    setSelectedIds(new Set());
    pulse();
  };

  const handleBulkStatus = (status: WatchStatus) => {
    setStatuses([...selectedIds], status);
    track('status_changed', { to: status, count: selectedIds.size });
    addToast(`${selectedIds.size} entries → ${status}`, 'success');
    setSelectedIds(new Set());
    pulse();
  };

  // ── Derived view data ──────────────────────────────────────────────────
  const { query, type: tFilter, status: stFilter, platform: pFilter, country: cFilter, sort } = filters;
  const countries = useMemo(() => countryOptions(state.entries), [state.entries]);
  // A country that no longer exists in the list (last title deleted) must not leave an empty view.
  const activeCountry = countries.some((c) => c.name === cFilter) ? cFilter : '';

  // Search: typo-tolerant, accent-insensitive, ranked, with filters like year:2024 (src/lib/search.ts).
  const parsedQuery = useMemo(() => parseQuery(query), [query]);
  const { filtered, scoreOf } = useMemo(() => {
    const ranked = parsedQuery.hasCriteria
      ? searchEntries(state.entries, state.meta, parsedQuery)
      : state.entries.map((entry) => ({ entry, score: 0 }));
    const scores = new Map<string, number>();
    const list: MovieEntry[] = [];
    for (const { entry: e, score } of ranked) {
      const m = state.meta[e.id];
      if (tFilter && e.type !== tFilter) continue;
      if (stFilter && (m?.status ?? 'plan') !== stFilter) continue;
      if (pFilter && m?.watchPlatform !== pFilter) continue;
      if (activeCountry && !hasCountry(e, activeCountry)) continue;
      scores.set(e.id, score);
      list.push(e);
    }
    return { filtered: list, scoreOf: scores };
  }, [state.entries, state.meta, parsedQuery, tFilter, stFilter, pFilter, activeCountry]);
  const rankByRelevance = !sort && (parsedQuery.terms.length > 0 || parsedQuery.phrases.length > 0);

  const navSections = useMemo(
    () => state.sectionOrder.filter((s) => state.entries.some((e) => e.section === s)),
    [state.sectionOrder, state.entries],
  );
  const sectionCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of filtered) c[e.section] = (c[e.section] ?? 0) + 1;
    return c;
  }, [filtered]);

  const activeSection = navSections.includes(filters.section) ? filters.section : '';
  const grouped = prefs.groupBySection && !activeSection;

  const groups = useMemo(() => {
    let list = activeSection ? filtered.filter((e) => e.section === activeSection) : filtered;
    if (sort && SORTERS[sort]) list = [...list].sort(SORTERS[sort]);
    // While searching (with the default sort), best matches first; ties keep "recently added".
    else if (rankByRelevance) list = [...list].reverse().sort((a, b) => (scoreOf.get(b.id) ?? 0) - (scoreOf.get(a.id) ?? 0));
    else list = [...list].reverse();   // default: recently added
    // Default view is one flat list; section headers only when the user turns grouping on.
    if (!grouped) return [{ section: null as string | null, entries: list }];
    return navSections
      .map((section) => ({ section: section as string | null, entries: list.filter((e) => e.section === section) }))
      .filter((g) => g.entries.length > 0);
  }, [filtered, activeSection, sort, navSections, grouped, rankByRelevance, scoreOf]);

  const handleReorder = (order: string[]) => {
    // Fires on every drag frame, so no analytics event here.
    reorderSections([...order, ...state.sectionOrder.filter((s) => !order.includes(s))]);
  };

  const drawerEntry = drawerId ? state.entries.find((e) => e.id === drawerId) ?? null : null;
  const drawerMeta = drawerEntry ? state.meta[drawerEntry.id] ?? { id: drawerEntry.id, status: 'plan' as WatchStatus } : null;
  const hasFilters = !!(parsedQuery.hasCriteria || tFilter || stFilter || pFilter || activeCountry || activeSection);
  const highlight = parsedQuery.terms.length || parsedQuery.phrases.length ? parsedQuery : null;

  if (loading || !initialised) {
    return (
      <div className="app-bg flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading CineTrack…</span>
        </div>
      </div>
    );
  }

  const renderItems = (entries: MovieEntry[]) => {
    const Item = view === 'grid' ? EntryCard : EntryRow;
    return (
      <div className={view === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' : 'flex flex-col gap-0.5'}>
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <Item
              key={entry.id}
              entry={entry}
              meta={state.meta[entry.id] ?? { id: entry.id, status: 'plan' }}
              selectMode={selectMode}
              selected={selectedIds.has(entry.id)}
              onOpen={() => setDrawerId(entry.id)}
              onToggleSelect={() => toggleSelect(entry.id)}
              onStatusChange={(s) => handleStatus(entry.id, s)}
              onPosterLoaded={(url) => updatePoster(entry.id, url)}
              showSection={prefs.showSectionTag && !grouped && !activeSection}
              showDetails={prefs.showCardDetails}
              highlight={highlight}
              active={entry.id === drawerId}
            />
          ))}
        </AnimatePresence>
      </div>
    );
  };

  const tabBtn = (tab: Tab, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => { if (tab === 'discover') setDiscoverStart('trending'); setActiveTab(tab); exitSelect(); }}
      title={label}
      aria-label={label}
      aria-pressed={activeTab === tab}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
      style={{
        background: activeTab === tab ? 'var(--bg-surface)' : 'transparent',
        color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
        boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      {icon} <span className={activeTab === tab ? '' : 'hidden min-[480px]:inline'}>{label}</span>
    </button>
  );

  return (
    <div className="app-bg relative min-h-screen">
      {/* Always mounted (the glow hook binds to it once); hidden when the effect is off. */}
      <div ref={glowRef} className={cn('pointer-events-none fixed inset-0 z-0', !prefs.cursorGlow && 'hidden')} />

      <div className="relative z-10">
        <Header
          state={state}
          user={user}
          lastSync={lastSync}
          syncStatus={syncStatus}
          cloudError={cloudError}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onSettings={() => setSettingsOpen(true)}
          onProfile={() => setProfileOpen(true)}
          onForceSync={handleForceSync}
          onRetrySync={retrySync}
        />

        <main className="mx-auto max-w-7xl px-4 py-6">
          {!user && <AuthBanner onSignIn={handleSignIn} />}

          {/* Row 1: tabs · search (applies to the active tab) · actions */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex flex-shrink-0 gap-1 rounded-xl p-1" style={{ background: 'var(--bg-elevated)' }}>
              {tabBtn('watchlist', <List className="h-3.5 w-3.5" />, 'Watchlist')}
              {tabBtn('discover', <Compass className="h-3.5 w-3.5" />, 'Discover')}
              {tabBtn('upcoming', <CalendarClock className="h-3.5 w-3.5" />, 'Upcoming')}
            </div>

            {activeTab !== 'upcoming' && (
              <SearchBox
                ref={searchRef}
                mode={activeTab}
                value={activeTab === 'watchlist' ? query : discoverQuery}
                onChange={(v) => activeTab === 'watchlist' ? setFilters((f) => ({ ...f, query: v })) : setDiscoverQuery(v)}
                matchCount={activeTab === 'watchlist' && parsedQuery.hasCriteria ? groups.reduce((n, g) => n + g.entries.length, 0) : null}
                className="order-last w-full sm:order-none sm:w-auto sm:flex-1"
              />
            )}

            {activeTab === 'watchlist' && (
              <div className="ml-auto flex items-center gap-2 sm:ml-0">
                <button
                  onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                  aria-label={selectMode ? 'Done selecting' : 'Select entries'}
                  title={selectMode ? 'Done selecting' : 'Select entries'}
                  className="flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors"
                  style={{
                    color: selectMode ? 'var(--accent-text)' : 'var(--text-muted)',
                    borderColor: selectMode ? 'var(--accent)' : 'var(--border-subtle)',
                    background: selectMode ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                  }}
                >
                  <CheckSquare className="h-3.5 w-3.5" /> <span className={selectMode ? '' : 'hidden min-[420px]:inline'}>{selectMode ? 'Done' : 'Select'}</span>
                </button>
                <Button onClick={openAdd} size="sm" className="h-9 gap-1.5">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            )}
          </div>

          {activeTab === 'discover' && (
            <Suspense fallback={<PageLoading />}>
            <DiscoverPage
              existingEntries={state.entries}
              meta={state.meta}
              sections={navSections}
              search={discoverQuery}
              region={region}
              myServices={prefs.myServices}
              openFirstResult={shareIntent}
              onOpenedFirstResult={() => setShareIntent(false)}
              onEdit={openEdit}
              initialTab={discoverStart}
              onAdd={(entryData, metaData) => {
                addEntry(entryData, metaData);
                addToast(`Added to watchlist${metaData.status && metaData.status !== 'plan' ? ` as ${metaData.status}` : ''}`, 'success');
                track('watchlist_entry_added', { source: 'discover', type: entryData.type, status: metaData.status ?? 'plan' });
                pulse();
              }}
            />
            </Suspense>
          )}

          {activeTab === 'upcoming' && (
            <Suspense fallback={<PageLoading />}>
            <UpcomingPage
              entries={state.entries}
              meta={state.meta}
              onOpen={(id) => setDrawerId(id)}
              onResolved={(id, tmdbId) => {
                // Pin the rating source first: a looked-up id must not relabel an IMDb score as TMDB.
                const e = state.entries.find((x) => x.id === id);
                updateEntry(id, { tmdbId, ratingSource: e?.ratingSource ?? 'imdb' });
              }}
              onBrowseComingSoon={() => { setDiscoverStart('soon'); setActiveTab('discover'); exitSelect(); }}
              onExported={(n) => addToast(`Calendar file with ${n} date${n === 1 ? '' : 's'} downloaded`, 'success')}
            />
            </Suspense>
          )}

          {activeTab === 'watchlist' && (
            <div className="pb-24">
              {/* Row 2: filters + sort + layout */}
              <div className="mb-5">
                <FilterBar filters={{ ...filters, country: activeCountry }} onChange={setFilters} sections={navSections} sectionCounts={sectionCounts} total={filtered.length} countries={countries}>
                  <div className="ml-auto flex flex-shrink-0 rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }} role="group" aria-label="Layout">
                    {([['grid', LayoutGrid, 'Grid view'], ['list', Rows3, 'List view']] as const).map(([mode, Icon, label]) => (
                      <button
                        key={mode}
                        onClick={() => setView(mode)}
                        aria-pressed={view === mode}
                        title={label}
                        aria-label={label}
                        className={cn('rounded-md p-1.5 transition-colors', view === mode ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </FilterBar>
              </div>

              {groups.every((g) => g.entries.length === 0) ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  {hasFilters ? (
                    // Watchlist search is for finding what you already have: one line, no suggestions,
                    // just a shortcut to look the title up on Discover if it isn't in the list yet.
                    <p>
                      Not in your list{query.trim() ? <>: “<b style={{ color: 'var(--text-primary)' }}>{query.trim()}</b>”</> : ' with these filters'}.
                      {freeText(parsedQuery) && (
                        <>
                          {' '}
                          <button
                            onClick={() => { setActiveTab('discover'); setDiscoverQuery(freeText(parsedQuery)); }}
                            className="font-semibold underline-offset-2 hover:underline"
                            style={{ color: 'var(--accent-text)' }}
                          >
                            Find it on Discover →
                          </button>
                        </>
                      )}
                    </p>
                  ) : 'No entries yet. Click "+ Add" or explore the Discover tab.'}
                </motion.div>
              ) : (
                <div className="space-y-8">
                  {groups.map(({ section, entries }) => (
                    <section key={section ?? '_flat'}>
                      {section && (
                        <button
                          onClick={() => setFilters((f) => ({ ...f, section }))}
                          className="mb-3 flex w-full items-center gap-2 text-left"
                          title={`Show only ${section}`}
                        >
                          <span className="text-base">{SECTION_EMOJIS[section] ?? '🎬'}</span>
                          <h2 className="text-sm font-semibold tracking-wide" style={{ color: SECTION_COLORS[section] ?? '#ea5fae' }}>{section}</h2>
                          <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{entries.length}</span>
                          <span className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
                        </button>
                      )}
                      {renderItems(entries)}
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <EntryDrawer
        entry={drawerEntry}
        meta={drawerMeta}
        onClose={() => setDrawerId(null)}
        onStatusChange={(s) => drawerEntry && handleStatus(drawerEntry.id, s)}
        onRatingChange={(r) => { if (!drawerEntry) return; setMeta(drawerEntry.id, { personalRating: r }); if (r != null) track('personal_rating_set', { rating: r }); }}
        onEdit={() => drawerEntry && openEdit(drawerEntry)}
        onDelete={() => { if (drawerEntry) { setDrawerId(null); setPendingDelete([drawerEntry.id]); } }}
        region={region}
        myServices={prefs.myServices}
        onEnrich={(patch) => { if (drawerEntry) updateEntry(drawerEntry.id, patch); }}
        onProgress={(pos, status) => {
          if (!drawerEntry) return;
          const before = state.meta[drawerEntry.id]?.status ?? 'plan';
          setProgress(drawerEntry.id, pos, status);
          if (status !== before) { addToast(status === 'watched' ? 'Finished — marked as watched' : `Marked as ${status}`, 'success'); pulse(); }
        }}
        onPlatformChange={(p) => { if (drawerEntry) { setMeta(drawerEntry.id, { watchPlatform: p }); if (p) track('platform_set', { platform: p }); } }}
        onWatchedOnChange={(d) => { if (drawerEntry) setMeta(drawerEntry.id, { watchedOn: d }); }}
        onNotesChange={(n) => {
          if (!drawerEntry) return;
          setMeta(drawerEntry.id, { notes: n || undefined });
          if (n) track('notes_saved');
        }}
      />

      <AddModal
        onPasteList={openPasteList}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onOpenExisting={(dup) => setDrawerId(dup.id)}
        editEntry={editEntry}
        editMeta={editMeta}
        existingEntries={state.entries}
        sections={state.sectionOrder}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.length === 1
          ? `Delete "${state.entries.find((e) => e.id === pendingDelete[0])?.title ?? 'entry'}"?`
          : `Delete ${pendingDelete?.length ?? 0} entries?`}
        description="This permanently removes them from your watchlist. Export a backup first if unsure."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <AnimatePresence>
        {settingsOpen && (
          <Suspense fallback={null}>
            <SettingsPage
              key="settings"
              onClose={() => setSettingsOpen(false)}
              prefs={prefs}
              onPrefChange={setPref}
              onResetPrefs={() => { resetPrefs(); setView('grid'); addToast('Display settings reset', 'info'); }}
              view={view}
              onViewChange={setView}
              sections={navSections}
              onReorderSections={handleReorder}
              entryCount={state.entries.length}
              region={region}
              user={user}
              onExport={handleExport}
              onImport={() => { setSettingsOpen(false); importRef.current?.click(); }}
              onPasteList={() => openPasteList()}
              onSelectToDelete={handleSelectToDelete}
              onDeleteAllTitles={handleDeleteAll}
              onEraseThisBrowser={() => wipeLocalDataAndReload('keep-empty-list')}
              onDeleteAccount={handleDeleteAccount}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {(importSeen.current ||= importSource !== null) && (
      <Suspense fallback={null}>
      <ExternalImportDialog
        source={importSource}
        onCancel={() => setImportSource(null)}
        existing={state.entries}
        onImport={(items) => {
          setImportSource(null);
          const imported: WatchlistState = {
            entries: items.map((i) => i.entry),
            meta: Object.fromEntries(items.map((i) => [i.entry.id, i.meta])),
            sectionOrder: [],
            lastModified: new Date().toISOString(),
          };
          const res = applyImport(imported, 'merge');
          track('import_json', { mode: 'external', added: res.added });
          addToast(res.added ? `Imported ${res.added} titles${res.skipped ? `, skipped ${res.skipped} already in your list` : ''}` : 'Nothing new — all titles already in your list', res.added ? 'success' : 'info');
          if (res.added) pulse();
        }}
      />
      </Suspense>
      )}

      <ImportDialog
        pending={pendingImport}
        currentCount={state.entries.length}
        onChoose={handleImportChoice}
        onCancel={() => setPendingImport(null)}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <PwaStatus />
      <ConsentBanner />

      <AnimatePresence>
        {profileOpen && (
          <Suspense fallback={null}>
            <ProfilePage key="profile" state={state} user={user} onClose={() => setProfileOpen(false)} />
          </Suspense>
        )}
      </AnimatePresence>

      <input ref={importRef} type="file" accept=".json,.csv,.zip,application/json,text/csv,application/zip" className="hidden" onChange={handleImportFile} />

      <BulkActionBar
        count={selectedIds.size}
        sections={state.sectionOrder}
        onStatusChange={handleBulkStatus}
        onMove={handleBulkMove}
        onDelete={() => setPendingDelete([...selectedIds])}
        onClear={exitSelect}
      />

      <AnimatePresence>
        {showScrollTop && selectedIds.size === 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--accent-gradient)] text-[var(--accent-fg)] shadow-lg transition-[filter] hover:brightness-110"
            aria-label="Scroll to top"
          >
            <ArrowUp className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
