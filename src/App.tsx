import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, ArrowUp, Compass, List, CheckSquare, LayoutGrid, Rows3, CalendarClock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { saveUserProfile } from '@/lib/firestore';
import { track } from '@/lib/analytics';
import { useWatchlist, type ImportMode } from '@/hooks/useWatchlist';
import { useToast } from '@/hooks/useToast';
import { useCursorGlow } from '@/hooks/useCursorGlow';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { usePreferences } from '@/hooks/usePreferences';
import { Header } from '@/components/layout/Header';
import { AuthBanner } from '@/components/auth/AuthBanner';
import { FilterBar } from '@/components/filters/FilterBar';
import { SearchBox } from '@/components/filters/SearchBox';
import { parseQuery, searchEntries, freeText } from '@/lib/search';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { EntryCard } from '@/components/watchlist/EntryCard';
import { EntryRow } from '@/components/watchlist/EntryRow';
import { EntryDrawer } from '@/components/watchlist/EntryDrawer';
import { AddModal } from '@/components/watchlist/AddModal';
import { ProfilePage } from '@/components/profile/ProfilePage';
import { DiscoverPage } from '@/components/discover/DiscoverPage';
import { UpcomingPage } from '@/components/upcoming/UpcomingPage';
import { BulkActionBar } from '@/components/ui/bulk-action-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ImportDialog } from '@/components/ui/import-dialog';
import { ExternalImportDialog } from '@/components/import/ExternalImportDialog';
import { ToastContainer } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { SECTION_COLORS, SECTION_EMOJIS, cn } from '@/lib/utils';
import { defaultRegion } from '@/lib/titleData';
import { sharedTextFrom } from '@/lib/links';
import type { FilterState, MovieEntry, WatchMeta, ThemeMode, WatchStatus, ViewMode, WatchlistState } from '@/types';

type Tab = 'watchlist' | 'discover' | 'upcoming';

const EMPTY_FILTERS: FilterState = { query: '', section: '', type: '', status: '', platform: '', sort: '' };
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
  const { user, loading, signIn, signOut } = useAuth();
  const uid = user?.uid ?? null;
  const {
    state, initialised, cloudError, retrySync,
    addEntry, updateEntry, deleteEntries,
    setStatus, setStatuses, setMeta, setProgress, reorderSections, updatePoster,
    exportJSON, parseImport, applyImport, forceSync,
    flush, lastSync, syncStatus,
  } = useWatchlist(uid);

  const { toasts, addToast, removeToast } = useToast();
  const { glowRef, pulse } = useCursorGlow();
  const [theme, setTheme] = useLocalStorage<ThemeMode>('cinetrack_theme', 'dark');
  const [view, setView] = useLocalStorage<ViewMode>('cinetrack_view', 'grid');
  const { prefs, setPref } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [shareIntent, setShareIntent] = useState(false);
  const region = prefs.region || defaultRegion();
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<MovieEntry | null>(null);
  const [editMeta, setEditMeta] = useState<WatchMeta | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [pendingImport, setPendingImport] = useState<WatchlistState | null>(null);
  const [externalFile, setExternalFile] = useState<File | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('watchlist');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const importRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    if (user) saveUserProfile(user).catch(() => {});
  }, [user]);

  // Android "Share → CineTrack" (Web Share Target) and plain ?url= links open Discover with the
  // shared title; an IMDb/TMDB link opens its add dialog straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = sharedTextFrom(params);
    if (!shared) return;
    window.history.replaceState(null, '', window.location.pathname);
    setActiveTab('discover');
    setDiscoverQuery(shared);
    setShareIntent(true);
  }, []);

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

  const changeTheme = (next: ThemeMode) => { if (next === theme) return; setTheme(next); track('theme_toggled', { theme: next }); };

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

  // ── Import / export / sync ──────────────────────────────────────────────
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Letterboxd / IMDb exports go through matching + review; JSON is a CineTrack backup.
    if (/\.(csv|zip)$/i.test(file.name)) {
      if (file.size > MAX_EXTERNAL_IMPORT_BYTES) { addToast('File is too large (max 25 MB)', 'error'); return; }
      setExternalFile(file);
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

  const handleExport = () => { exportJSON(); addToast('Exported!', 'success'); track('export_json'); };

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

  const handleBulkStatus = (status: WatchStatus) => {
    setStatuses([...selectedIds], status);
    track('status_changed', { to: status, count: selectedIds.size });
    addToast(`${selectedIds.size} entries → ${status}`, 'success');
    setSelectedIds(new Set());
    pulse();
  };

  // ── Derived view data ──────────────────────────────────────────────────
  const { query, type: tFilter, status: stFilter, platform: pFilter, sort } = filters;

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
      scores.set(e.id, score);
      list.push(e);
    }
    return { filtered: list, scoreOf: scores };
  }, [state.entries, state.meta, parsedQuery, tFilter, stFilter, pFilter]);
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
  const hasFilters = !!(parsedQuery.hasCriteria || tFilter || stFilter || pFilter || activeSection);
  const highlight = parsedQuery.terms.length || parsedQuery.phrases.length ? parsedQuery : null;

  if (loading || !initialised) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
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
            />
          ))}
        </AnimatePresence>
      </div>
    );
  };

  const tabBtn = (tab: Tab, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => { setActiveTab(tab); exitSelect(); }}
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
    <div className="relative min-h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Always mounted (the glow hook binds to it once); hidden when the effect is off. */}
      <div ref={glowRef} className={cn('pointer-events-none fixed inset-0 z-0', !prefs.cursorGlow && 'hidden')} />

      <div className="relative z-10">
        <Header
          state={state}
          user={user}
          theme={theme}
          lastSync={lastSync}
          syncStatus={syncStatus}
          cloudError={cloudError}
          onToggleTheme={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}
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
                    color: selectMode ? 'var(--accent-purple)' : 'var(--text-muted)',
                    borderColor: selectMode ? 'var(--accent-purple)' : 'var(--border-subtle)',
                    background: selectMode ? 'color-mix(in srgb, var(--accent-purple) 10%, transparent)' : 'transparent',
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
              onAdd={(entryData, metaData) => {
                addEntry(entryData, metaData);
                addToast(`Added to watchlist${metaData.status && metaData.status !== 'plan' ? ` as ${metaData.status}` : ''}`, 'success');
                track('watchlist_entry_added', { source: 'discover', type: entryData.type, status: metaData.status ?? 'plan' });
                pulse();
              }}
            />
          )}

          {activeTab === 'upcoming' && (
            <UpcomingPage
              entries={state.entries}
              meta={state.meta}
              onOpen={(id) => setDrawerId(id)}
              onResolved={(id, tmdbId) => updateEntry(id, { tmdbId })}
              onExported={(n) => addToast(`Calendar file with ${n} date${n === 1 ? '' : 's'} downloaded`, 'success')}
            />
          )}

          {activeTab === 'watchlist' && (
            <div className="pb-24">
              {/* Row 2: filters + sort + layout */}
              <div className="mb-5">
                <FilterBar filters={filters} onChange={setFilters} sections={navSections} sectionCounts={sectionCounts} total={filtered.length}>
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
                    <div className="flex flex-col items-center gap-3">
                      <span>No titles in your list match{query ? <> “<b style={{ color: 'var(--text-primary)' }}>{query.trim()}</b>”</> : ' these filters'}.</span>
                      {freeText(parsedQuery) && (
                        <button
                          onClick={() => { setActiveTab('discover'); setDiscoverQuery(freeText(parsedQuery)); }}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                          style={{ background: 'var(--accent-purple)' }}
                        >
                          <Compass className="h-3.5 w-3.5" /> Search “{freeText(parsedQuery)}” on Discover
                        </button>
                      )}
                    </div>
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
                          <h2 className="text-sm font-semibold tracking-wide" style={{ color: SECTION_COLORS[section] ?? '#818cf8' }}>{section}</h2>
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
        onSetPlatform={(p) => { if (drawerEntry) { setMeta(drawerEntry.id, { watchPlatform: p }); track('platform_set', { platform: p }); } }}
      />

      <AddModal
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

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        onPrefChange={setPref}
        theme={theme}
        onThemeChange={changeTheme}
        view={view}
        onViewChange={setView}
        sections={navSections}
        onReorderSections={handleReorder}
        entryCount={state.entries.length}
        region={region}
        onExport={handleExport}
        onImport={() => { setSettingsOpen(false); importRef.current?.click(); }}
      />

      <ExternalImportDialog
        file={externalFile}
        onCancel={() => setExternalFile(null)}
        onImport={(items) => {
          setExternalFile(null);
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

      <ImportDialog
        pending={pendingImport}
        currentCount={state.entries.length}
        onChoose={handleImportChoice}
        onCancel={() => setPendingImport(null)}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <AnimatePresence>
        {profileOpen && <ProfilePage key="profile" state={state} user={user} onClose={() => setProfileOpen(false)} />}
      </AnimatePresence>

      <input ref={importRef} type="file" accept=".json,.csv,.zip,application/json,text/csv,application/zip" className="hidden" onChange={handleImportFile} />

      <BulkActionBar
        count={selectedIds.size}
        onStatusChange={handleBulkStatus}
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
            className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg transition-colors hover:bg-indigo-600"
            aria-label="Scroll to top"
          >
            <ArrowUp className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
