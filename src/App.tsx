import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, ArrowUp, Compass, List, CheckSquare, LayoutGrid, Rows3 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useFirestore } from '@/hooks/useFirestore';
import { useWatchlist, type ImportMode } from '@/hooks/useWatchlist';
import { useToast } from '@/hooks/useToast';
import { useCursorGlow } from '@/hooks/useCursorGlow';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Header } from '@/components/layout/Header';
import { AuthBanner } from '@/components/auth/AuthBanner';
import { FilterBar } from '@/components/filters/FilterBar';
import { SectionSidebar, SectionChips } from '@/components/watchlist/SectionNav';
import { EntryCard } from '@/components/watchlist/EntryCard';
import { EntryRow } from '@/components/watchlist/EntryRow';
import { EntryDrawer } from '@/components/watchlist/EntryDrawer';
import { AddModal } from '@/components/watchlist/AddModal';
import { ProfilePage } from '@/components/profile/ProfilePage';
import { DiscoverPage } from '@/components/discover/DiscoverPage';
import { BulkActionBar } from '@/components/ui/bulk-action-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ImportDialog } from '@/components/ui/import-dialog';
import { ToastContainer } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { SECTION_COLORS, SECTION_EMOJIS, cn } from '@/lib/utils';
import type { FilterState, MovieEntry, WatchMeta, ThemeMode, WatchStatus, ViewMode, WatchlistState } from '@/types';

const EMPTY_FILTERS: FilterState = { query: '', section: '', type: '', status: '', platform: '', sort: '' };
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const num = (v: string, fallback: number) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };
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
  const { load, save, saveImmediate, saveProfile, flush, lastSync, status: syncStatus } = useFirestore(uid);
  const {
    state, initialised, cloudError, retrySync,
    addEntry, updateEntry, deleteEntries,
    setStatus, setStatuses, setMeta, reorderSections, updatePoster,
    exportJSON, parseImport, applyImport, forceSync,
  } = useWatchlist(uid, load, save);

  const { toasts, addToast, removeToast } = useToast();
  const { glowRef, pulse } = useCursorGlow();
  const [theme, setTheme] = useLocalStorage<ThemeMode>('cinetrack_theme', 'dark');
  const [view, setView] = useLocalStorage<ViewMode>('cinetrack_view', 'grid');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<MovieEntry | null>(null);
  const [editMeta, setEditMeta] = useState<WatchMeta | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [pendingImport, setPendingImport] = useState<WatchlistState | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'watchlist' | 'discover'>('watchlist');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    if (user) saveProfile(user).catch(() => {});
  }, [user, saveProfile]);

  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // ── Auth ────────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    try {
      if (await signIn()) addToast('Signed in — syncing your list', 'success');
    } catch {
      addToast('Sign-in failed. Check pop-up blockers and try again.', 'error');
    }
  };

  const handleSignOut = async () => {
    // Push queued edits while we are still authenticated; afterwards the rules reject the write.
    await flush();
    try {
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
    if (editEntry) {
      updateEntry(editEntry.id, entryData, metaData);
      addToast('Entry updated', 'success');
    } else {
      addEntry(entryData, metaData);
      addToast('Entry added', 'success');
    }
    pulse();
  };

  const handleStatus = (id: string, s: WatchStatus) => {
    setStatus(id, s);
    pulse();
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteEntries(pendingDelete);
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
    if (mode === 'replace') addToast(`Replaced list with ${res.added} titles`, 'success');
    else addToast(res.added ? `Imported ${res.added} new${res.skipped ? `, skipped ${res.skipped} duplicates` : ''}` : 'Nothing new — all titles already in your list', res.added ? 'success' : 'info');
    if (res.added) pulse();
  };

  const handleExport = () => { exportJSON(); addToast('Exported!', 'success'); };

  const handleForceSync = async () => {
    try {
      await forceSync(saveImmediate);
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
    addToast(`${selectedIds.size} entries → ${status}`, 'success');
    setSelectedIds(new Set());
    pulse();
  };

  // ── Derived view data ──────────────────────────────────────────────────
  const { query, type: tFilter, status: stFilter, platform: pFilter, sort } = filters;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.entries.filter((e) => {
      const m = state.meta[e.id];
      if (q && ![e.title, e.genre, e.country, e.year, m?.notes].some((f) => f?.toLowerCase().includes(q))) return false;
      if (tFilter && e.type !== tFilter) return false;
      if (stFilter && (m?.status ?? 'plan') !== stFilter) return false;
      if (pFilter && m?.watchPlatform !== pFilter) return false;
      return true;
    });
  }, [state.entries, state.meta, query, tFilter, stFilter, pFilter]);

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
  const setSection = (s: string) => { setFilters((f) => ({ ...f, section: s })); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const groups = useMemo(() => {
    let list = activeSection ? filtered.filter((e) => e.section === activeSection) : filtered;
    if (sort && SORTERS[sort]) list = [...list].sort(SORTERS[sort]);
    // "All" without a sort keeps the user's section grouping; any sort shows one flat, globally sorted list.
    if (activeSection || sort) return [{ section: null as string | null, entries: list }];
    return navSections
      .map((section) => ({ section: section as string | null, entries: list.filter((e) => e.section === section) }))
      .filter((g) => g.entries.length > 0);
  }, [filtered, activeSection, sort, navSections]);

  const handleReorder = (order: string[]) => {
    reorderSections([...order, ...state.sectionOrder.filter((s) => !order.includes(s))]);
  };

  const drawerEntry = drawerId ? state.entries.find((e) => e.id === drawerId) ?? null : null;
  const drawerMeta = drawerEntry ? state.meta[drawerEntry.id] ?? { id: drawerEntry.id, status: 'plan' as WatchStatus } : null;
  const hasFilters = !!(query || tFilter || stFilter || pFilter);

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
      <div className={view === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5' : 'flex flex-col gap-0.5'}>
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
            />
          ))}
        </AnimatePresence>
      </div>
    );
  };

  const tabBtn = (tab: 'watchlist' | 'discover', icon: React.ReactNode, label: string) => (
    <button
      onClick={() => { setActiveTab(tab); exitSelect(); }}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
      style={{
        background: activeTab === tab ? 'var(--bg-surface)' : 'transparent',
        color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
        boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="relative min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <div ref={glowRef} className="pointer-events-none fixed inset-0 z-0" />

      <div className="relative z-10">
        <Header
          state={state}
          user={user}
          theme={theme}
          lastSync={lastSync}
          syncStatus={syncStatus}
          cloudError={cloudError}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onExport={handleExport}
          onImport={() => importRef.current?.click()}
          onProfile={() => setProfileOpen(true)}
          onForceSync={handleForceSync}
          onRetrySync={retrySync}
        />

        <main className="mx-auto max-w-7xl px-4 py-6">
          {!user && <AuthBanner onSignIn={handleSignIn} />}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--bg-elevated)' }}>
              {tabBtn('watchlist', <List className="h-3.5 w-3.5" />, 'Watchlist')}
              {tabBtn('discover', <Compass className="h-3.5 w-3.5" />, 'Discover')}
            </div>

            {activeTab === 'watchlist' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    color: selectMode ? 'var(--accent-purple)' : 'var(--text-muted)',
                    borderColor: selectMode ? 'var(--accent-purple)' : 'var(--border-subtle)',
                    background: selectMode ? 'color-mix(in srgb, var(--accent-purple) 10%, transparent)' : 'transparent',
                  }}
                >
                  <CheckSquare className="h-3.5 w-3.5" /> {selectMode ? 'Done' : 'Select'}
                </button>
                <Button onClick={openAdd} size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            )}
          </div>

          {activeTab === 'discover' && (
            <DiscoverPage
              existingEntries={state.entries}
              onAdd={(entryData, metaData) => {
                addEntry(entryData, metaData);
                addToast('Added to watchlist!', 'success');
                pulse();
              }}
            />
          )}

          {activeTab === 'watchlist' && (
            <div className="flex gap-6">
              <SectionSidebar
                sections={navSections}
                counts={sectionCounts}
                total={filtered.length}
                active={activeSection}
                onSelect={setSection}
                onReorder={handleReorder}
              />

              <div className="min-w-0 flex-1 pb-24">
                <SectionChips sections={navSections} counts={sectionCounts} total={filtered.length} active={activeSection} onSelect={setSection} />

                <div className="mb-4">
                  <FilterBar filters={filters} onChange={setFilters}>
                    <div className="ml-auto flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }} role="group" aria-label="View">
                      {([['grid', LayoutGrid, 'Grid view'], ['list', Rows3, 'List view']] as const).map(([mode, Icon, label]) => (
                        <button
                          key={mode}
                          onClick={() => setView(mode)}
                          aria-pressed={view === mode}
                          title={label}
                          className={cn('rounded-md p-1.5 transition-colors', view === mode ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  </FilterBar>
                </div>

                {groups.length === 0 || groups.every((g) => g.entries.length === 0) ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    {hasFilters
                      ? 'No entries match your filters.'
                      : 'No entries yet. Click "+ Add" or explore the Discover tab.'}
                  </motion.div>
                ) : (
                  <div className="space-y-8">
                    {groups.map(({ section, entries }) => (
                      <section key={section ?? '_flat'}>
                        {section && (
                          <button
                            onClick={() => setSection(section)}
                            className="mb-3 flex w-full items-center gap-2 text-left"
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
            </div>
          )}
        </main>
      </div>

      <EntryDrawer
        entry={drawerEntry}
        meta={drawerMeta}
        onClose={() => setDrawerId(null)}
        onStatusChange={(s) => drawerEntry && handleStatus(drawerEntry.id, s)}
        onRatingChange={(r) => drawerEntry && setMeta(drawerEntry.id, { personalRating: r })}
        onEdit={() => drawerEntry && openEdit(drawerEntry)}
        onDelete={() => { if (drawerEntry) { setDrawerId(null); setPendingDelete([drawerEntry.id]); } }}
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

      <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportFile} />

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
