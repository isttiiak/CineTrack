import { useEffect, useMemo, useState } from 'react';
import { Film, Loader2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { readExportFile, type ExportKind } from '@/lib/csvImport';
import { matchCandidates, toEntry, type MatchResult, type MatchHit } from '@/lib/importMatch';
import { MAX_ENTRIES } from '@/lib/schema';
import type { MovieEntry, WatchMeta } from '@/types';

interface Props {
  file: File | null;
  onCancel: () => void;
  onImport: (items: { entry: MovieEntry; meta: WatchMeta }[]) => void;
}

const SOURCE: Record<string, string> = {
  'letterboxd-watched': 'Letterboxd', 'letterboxd-ratings': 'Letterboxd', 'letterboxd-diary': 'Letterboxd',
  'letterboxd-watchlist': 'Letterboxd', imdb: 'IMDb', generic: 'CSV',
};
const STATUS_LABEL = { plan: 'Plan', watching: 'Watching', watched: 'Watched' } as const;

/**
 * Imports a Letterboxd export (.zip or its CSVs) or an IMDb ratings/watchlist CSV: reads it, matches
 * every row to TMDB, then lets the user review uncertain matches before anything is added.
 */
export function ExternalImportDialog({ file, onCancel, onImport }: Props) {
  const [phase, setPhase] = useState<'reading' | 'matching' | 'review' | 'error'>('reading');
  const [kinds, setKinds] = useState<ExportKind[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setPhase('reading'); setResults([]); setDone(0); setError('');
    (async () => {
      try {
        const { kinds, candidates } = await readExportFile(file);
        if (cancelled) return;
        if (candidates.length === 0) { setError('No titles found. Use a Letterboxd export (.zip, watched.csv, ratings.csv, diary.csv, watchlist.csv) or an IMDb ratings/watchlist CSV.'); setPhase('error'); return; }
        const list = candidates.slice(0, MAX_ENTRIES);
        setKinds(kinds); setTotal(list.length); setPhase('matching');
        const res = await matchCandidates(list, (n) => { if (!cancelled) setDone(n); }, () => cancelled);
        if (cancelled) return;
        setResults(res);
        // Confident matches are pre-selected; uncertain ones wait for the user's OK.
        setSelected(new Set(res.map((r, i) => (r.hit && r.confident ? i : -1)).filter((i) => i >= 0)));
        setPhase('review');
      } catch {
        if (!cancelled) { setError('Could not read that file.'); setPhase('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  const matched = useMemo(() => results.map((r, i) => ({ r, i })).filter(({ r }) => r.hit), [results]);
  const unsure = matched.filter(({ r }) => !r.confident);
  const sure = matched.filter(({ r }) => r.confident);
  const unmatched = results.filter((r) => !r.hit);

  const toggle = (i: number) => setSelected((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const confirm = () => onImport(
    [...selected].map((i) => results[i]).filter((r): r is MatchResult & { hit: MatchHit } => !!r?.hit).map(toEntry),
  );

  if (!file) return null;
  const source = [...new Set(kinds.map((k) => SOURCE[k]))].join(' + ') || 'file';

  const row = ({ r, i }: { r: MatchResult; i: number }) => {
    const h = r.hit!;
    const sameTitle = h.title.toLowerCase() === r.candidate.title.toLowerCase();
    return (
      <label key={i} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--bg-hover)]">
        <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="h-4 w-4 flex-shrink-0 accent-indigo-500" />
        <span className="h-12 w-8 flex-shrink-0 overflow-hidden rounded" style={{ background: 'var(--bg-elevated)' }}>
          {h.posterPath ? <img src={`https://image.tmdb.org/t/p/w92${h.posterPath}`} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <Film className="m-2 h-4 w-4 opacity-30" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{h.title} <span style={{ color: 'var(--text-muted)' }}>{h.year}</span></span>
          <span className="block truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {!sameTitle || h.year !== r.candidate.year ? <>From “{r.candidate.title}” {r.candidate.year} · </> : null}
            {STATUS_LABEL[r.candidate.status]}
            {r.candidate.rating !== undefined && <> · {r.candidate.rating}/10</>}
            {r.candidate.watchedOn && <> · {r.candidate.watchedOn}</>}
          </span>
        </span>
      </label>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="flex max-w-lg flex-col" aria-describedby={undefined}>
        <div className="p-6 pb-2 pr-12">
          <DialogTitle className="text-lg">Import from {source}</DialogTitle>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{file.name}</p>
        </div>

        <div className="min-h-[120px] px-6 py-2">
          {(phase === 'reading' || phase === 'matching') && (
            <div className="flex flex-col items-center gap-3 py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
              {phase === 'reading' ? 'Reading file…' : `Matching titles on TMDB… ${done}/${total}`}
              {phase === 'matching' && (
                <div className="h-1 w-48 overflow-hidden rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="h-full bg-indigo-500 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                </div>
              )}
            </div>
          )}

          {phase === 'error' && (
            <p className="flex items-start gap-2 py-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" /> {error}
            </p>
          )}

          {phase === 'review' && (
            <div className="grid gap-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Found <b>{results.length}</b> titles: {sure.length} matched
                {unsure.length > 0 && <>, {unsure.length} need a check</>}
                {unmatched.length > 0 && <>, {unmatched.length} not found</>}.
                Titles already in your list are skipped automatically.
              </p>
              <div className="max-h-[45vh] overflow-y-auto rounded-xl border p-1" style={{ borderColor: 'var(--border-subtle)' }}>
                {unsure.length > 0 && (
                  <>
                    <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-amber-400">Check these matches</p>
                    {unsure.map(row)}
                  </>
                )}
                {sure.length > 0 && (
                  <>
                    <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>Matched</p>
                    {sure.map(row)}
                  </>
                )}
                {unmatched.length > 0 && (
                  <>
                    <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-disabled)' }}>Not found on TMDB</p>
                    {unmatched.map((r) => (
                      <p key={r.candidate.key} className="px-2 py-1 text-xs" style={{ color: 'var(--text-muted)' }}>{r.candidate.title} {r.candidate.year}</p>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={confirm} disabled={phase !== 'review' || selected.size === 0}>
            Import {phase === 'review' ? selected.size : ''} titles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
