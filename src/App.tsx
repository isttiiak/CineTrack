import { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, ArrowUp } from 'lucide-react';
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
import { ToastContainer } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import type { FilterState, MovieEntry, WatchMeta, ThemeMode } from '@/types';

const EMPTY_FILTERS: FilterState = { query: '', section: '', type: '', status: '', platform: '', sort: '' };

export default function App() {
  const { user, loading, signIn, signOut } = useAuth();
  const { load, save, saveProfile, lastSyncRef } = useFirestore(user?.uid ?? null);
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
  const handleToggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

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
          onToggleTheme={handleToggleTheme}
          onSignIn={signIn}
          onSignOut={signOut}
          onExport={handleExport}
          onImport={handleImport}
        />

        <main className="mx-auto max-w-6xl px-4 py-6">
          {!user && <AuthBanner onSignIn={signIn} />}

          <div className="flex items-start gap-3 mb-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <FilterBar filters={filters} onChange={setFilters} sections={state.sectionOrder} />
            </div>
            <Button onClick={openAdd} size="sm" className="flex-shrink-0 gap-1.5">
              <Plus className="h-4 w-4" /> Add
            </Button>
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
                  />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </main>
      </div>

      <AddModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        editEntry={editEntry}
        editMeta={editMeta}
        existingEntries={state.entries}
        existingMeta={state.meta}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />

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
