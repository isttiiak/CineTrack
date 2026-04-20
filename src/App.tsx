import { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, ArrowUp, Compass, List, CheckSquare } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useFirestore } from '@/hooks/useFirestore';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useToast } from '@/hooks/useToast';
import { useCursorGlow } from '@/hooks/useCursorGlow';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Header } from '@/components/layout/Header';
import { AuthBanner } from '@/components/auth/AuthBanner';
import { FilterBar } from '@/components/filters/FilterBar';
import { WatchlistSection } from '@/components/watchlist/WatchlistSection';
import { AddModal } from '@/components/watchlist/AddModal';
import { DuplicateDialog } from '@/components/ui/duplicate-dialog';
import { ProfilePage } from '@/components/profile/ProfilePage';
import { DiscoverPage } from '@/components/discover/DiscoverPage';
import { BulkActionBar } from '@/components/ui/bulk-action-bar';
import { ToastContainer } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import type { FilterState, MovieEntry, WatchMeta, ThemeMode, WatchStatus } from '@/types';

const EMPTY_FILTERS: FilterState = { query: '', section: '', type: '', status: '', platform: '', sort: '' };

export default function App() {
  const { user, loading, signIn, signOut } = useAuth();
  const { load, save, saveImmediate, saveProfile, lastSyncRef } = useFirestore(user?.uid ?? null);
  const {
    state, initialised,
    addEntry, updateEntry, deleteEntry,
    setStatus, setMeta, updatePoster,
    exportJSON, importJSON,
  } = useWatchlist(user?.uid ?? null, load, save);

  const { toasts, addToast, removeToast } = useToast();
  const { glowRef, pulse } = useCursorGlow();
  const [theme, setTheme] = useLocalStorage<ThemeMode>('cinetrack_theme', 'dark');
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<MovieEntry | null>(null);
  const [editMeta, setEditMeta] = useState<WatchMeta | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [dupEntry, setDupEntry] = useState<MovieEntry | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'watchlist' | 'discover'>('watchlist');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const importRef = useRef<HTMLInputElement>(null);

  // Apply theme
  document.documentElement.classList.toggle('light', theme === 'light');

  // Save profile on sign-in
  useEffect(() => {
    if (user) saveProfile(user).catch(() => {});
  }, [user, saveProfile]);

  // Scroll to top FAB
  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const openAdd = () => { setEditEntry(null); setEditMeta(null); setModalOpen(true); };
  const openEdit = useCallback((entry: MovieEntry) => {
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

  const handleDelete = (id: string) => {
    deleteEntry(id);
    addToast('Entry deleted', 'info');
    pulse();
  };

  const handleImport = () => importRef.current?.click();
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const ok = importJSON(ev.target?.result as string);
      addToast(ok ? 'Watchlist imported!' : 'Invalid file', ok ? 'success' : 'error');
      if (ok) pulse();
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExport = () => { exportJSON(); addToast('Exported!', 'success'); };

  const [syncing, setSyncing] = useState(false);
  const handleForceSync = async () => {
    if (!user || syncing) return;
    setSyncing(true);
    try {
      const snap = { ...state, lastModified: new Date().toISOString() };
      await saveImmediate(snap);
      lastSyncRef.current = new Date().toISOString();
      addToast('Synced to cloud!', 'success');
    } catch {
      addToast('Sync failed — check connection', 'error');
    } finally {
      setSyncing(false);
    }
  };
  const handleToggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkStatus = (status: WatchStatus) => {
    selectedIds.forEach(id => setStatus(id, status));
    addToast(`${selectedIds.size} entries → ${status}`, 'success');
    setSelectedIds(new Set());
    pulse();
  };

  const handleBulkDelete = () => {
    selectedIds.forEach(id => deleteEntry(id));
    addToast(`${selectedIds.size} entries deleted`, 'info');
    setSelectedIds(new Set());
    pulse();
  };

  // Filter entries
  const { query, section: sFilter, type: tFilter, status: stFilter, platform: pFilter, sort } = filters;
  const filteredEntries = state.entries.filter((e) => {
    const m = state.meta[e.id];
    if (query) {
      const q = query.toLowerCase();
      if (![e.title, e.genre, e.country, e.year].some((f) => f?.toLowerCase().includes(q))) return false;
    }
    if (sFilter && e.section !== sFilter) return false;
    if (tFilter && e.type !== tFilter) return false;
    if (stFilter && m?.status !== stFilter) return false;
    if (pFilter && m?.watchPlatform !== pFilter) return false;
    return true;
  });

  const sortedEntries = sort
    ? [...filteredEntries].sort((a, b) => {
        if (sort === 'title_asc') return a.title.localeCompare(b.title);
        if (sort === 'title_desc') return b.title.localeCompare(a.title);
        if (sort === 'year_desc') return parseInt(b.year || '0') - parseInt(a.year || '0');
        if (sort === 'year_asc') return parseInt(a.year || '0') - parseInt(b.year || '0');
        if (sort === 'imdb_desc') return parseFloat(b.imdbRating || '0') - parseFloat(a.imdbRating || '0');
        if (sort === 'imdb_asc') return parseFloat(a.imdbRating || '0') - parseFloat(b.imdbRating || '0');
        return 0;
      })
    : filteredEntries;

  const visibleSections = state.sectionOrder.filter((s) =>
    sortedEntries.some((e) => e.section === s)
  );

  if (loading || !initialised) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading CineTrack…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Cursor glow */}
      <div ref={glowRef} className="pointer-events-none fixed inset-0 z-0" />

      <div className="relative z-10">
        <Header
          state={state}
          user={user}
          theme={theme}
          lastSync={lastSyncRef.current}
          syncing={syncing}
          onToggleTheme={handleToggleTheme}
          onSignIn={signIn}
          onSignOut={signOut}
          onExport={handleExport}
          onImport={handleImport}
          onProfile={() => setProfileOpen(true)}
          onForceSync={handleForceSync}
        />

        <main className="mx-auto max-w-6xl px-4 py-6">
          {!user && <AuthBanner onSignIn={signIn} />}

          {/* Tab navigation */}
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
              <button
                onClick={() => { setActiveTab('watchlist'); setSelectMode(false); setSelectedIds(new Set()); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: activeTab === 'watchlist' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'watchlist' ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: activeTab === 'watchlist' ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                }}
              >
                <List className="h-3.5 w-3.5" /> Watchlist
              </button>
              <button
                onClick={() => { setActiveTab('discover'); setSelectMode(false); setSelectedIds(new Set()); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: activeTab === 'discover' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'discover' ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: activeTab === 'discover' ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                }}
              >
                <Compass className="h-3.5 w-3.5" /> Discover
              </button>
            </div>

            {activeTab === 'watchlist' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setSelectMode(p => !p); setSelectedIds(new Set()); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                  style={{
                    color: selectMode ? 'var(--accent-purple)' : 'var(--text-muted)',
                    borderColor: selectMode ? 'var(--accent-purple)' : 'var(--border-subtle)',
                    background: selectMode ? 'color-mix(in srgb, var(--accent-purple) 10%, transparent)' : 'transparent',
                  }}
                >
                  <CheckSquare className="h-3.5 w-3.5" /> Select
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
            <>
              <div className="mb-4">
                <FilterBar filters={filters} onChange={setFilters} sections={state.sectionOrder} />
              </div>

              <AnimatePresence mode="popLayout">
                {visibleSections.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="py-20 text-center text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {query || sFilter || tFilter || stFilter || pFilter || sort
                      ? 'No entries match your filters or sort.'
                      : 'No entries yet. Click "+ Add" to get started!'}
                  </motion.div>
                ) : (
                  visibleSections.map((section) => (
                    <motion.div key={section} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <WatchlistSection
                        section={section}
                        entries={sortedEntries.filter((e) => e.section === section)}
                        meta={state.meta}
                        onStatusChange={(id, s) => {
                          setStatus(id, s);
                          pulse();
                          addToast(`Status → ${s}`, 'success');
                        }}
                        onRatingChange={(id, r) => {
                          setMeta(id, { personalRating: r });
                          pulse();
                        }}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onPosterLoaded={updatePoster}
                        selectMode={selectMode}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                      />
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </>
          )}
        </main>
      </div>

      <AddModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDuplicate={(dup) => setDupEntry(dup)}
        editEntry={editEntry}
        editMeta={editMeta}
        existingEntries={state.entries}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <AnimatePresence>
        {profileOpen && (
          <ProfilePage
            key="profile"
            state={state}
            user={user}
            onClose={() => setProfileOpen(false)}
          />
        )}
      </AnimatePresence>

      <DuplicateDialog
        open={dupEntry !== null}
        entry={dupEntry}
        meta={dupEntry ? state.meta[dupEntry.id] : null}
        onClose={() => setDupEntry(null)}
      />

      <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />

      <BulkActionBar
        count={selectedIds.size}
        onStatusChange={handleBulkStatus}
        onDelete={handleBulkDelete}
        onClear={() => { setSelectedIds(new Set()); setSelectMode(false); }}
      />

      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg hover:bg-indigo-600 transition-colors"
          >
            <ArrowUp className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
