import { useEffect, useMemo, useRef, useState } from 'react';
import { findDuplicate, normalizeTitle } from '@/lib/duplicates';
import { Film, Loader2, AlertTriangle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { STATUS_CONFIG } from '@/components/watchlist/StatusBadge';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { candidatesFromText, readExportFile, type ExportKind, type ImportCandidate } from '@/lib/csvImport';
import { matchCandidates, toEntry, type MatchResult, type MatchHit } from '@/lib/importMatch';
import { MAX_ENTRIES } from '@/lib/schema';
import { formatWatchDate } from '@/lib/watchDate';
import type { MovieEntry, WatchMeta, WatchStatus } from '@/types';

export type ImportSource = { kind: 'file'; file: File } | { kind: 'text'; text: string };

interface Props {
  source: ImportSource | null;
  onCancel: () => void;
  onImport: (items: { entry: MovieEntry; meta: WatchMeta }[]) => void;
  existing: MovieEntry[];   // to flag titles already in the list
}

const SOURCE: Record<string, string> = {
  'letterboxd-watched': 'Letterboxd', 'letterboxd-ratings': 'Letterboxd', 'letterboxd-diary': 'Letterboxd',
  'letterboxd-watchlist': 'Letterboxd', imdb: 'IMDb', cinetrack: 'CineTrack CSV', generic: 'CSV',
};
const STATUS_LABEL = { plan: 'Plan', watching: 'Watching', watched: 'Watched' } as const;

/**
 * Imports a Letterboxd export (.zip or its CSVs) or an IMDb ratings/watchlist CSV: reads it, matches
 * every row to TMDB, then lets the user review uncertain matches before anything is added.
 */
export function ExternalImportDialog({ source, onCancel, onImport, existing }: Props) {
  const file = source?.kind === 'file' ? source.file : null;
  const isText = source?.kind === 'text';
  const [phase, setPhase] = useState<'input' | 'reading' | 'matching' | 'review' | 'error'>('reading');
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [statusForAll, setStatusForAll] = useState<WatchStatus>('plan');
  // The matching effect runs async; read the latest "already listed" check through a ref.
  const listedRef = useRef<(r: MatchResult) => boolean>(() => false);
  const [kinds, setKinds] = useState<ExportKind[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');

  // A pasted list starts at the text box (pre-filled with whatever was pasted).
  useEffect(() => {
    if (source?.kind !== 'text') return;
    setText(source.text); setSubmitted(null); setPhase('input'); setStatusForAll('plan');
  }, [source]);

  useEffect(() => {
    if (!file && submitted === null) return;
    let cancelled = false;
    setPhase('reading'); setResults([]); setDone(0); setError('');
    (async () => {
      try {
        const { kinds, candidates } = file
          ? await readExportFile(file)
          : { kinds: [] as ExportKind[], candidates: candidatesFromText(submitted ?? '') as ImportCandidate[] };
        if (cancelled) return;
        if (candidates.length === 0) {
          setError(file
            ? 'No titles found. Use a Letterboxd export (.zip, watched.csv, ratings.csv, diary.csv, watchlist.csv) or an IMDb ratings/watchlist CSV.'
            : 'No titles found. Put one title per line, e.g. "Inception (2010)".');
          setPhase('error'); return;
        }
        const list = candidates.slice(0, MAX_ENTRIES);
        setKinds(kinds); setTotal(list.length); setPhase('matching');
        const res = await matchCandidates(list, (n) => { if (!cancelled) setDone(n); }, () => cancelled);
        if (cancelled) return;
        setResults(res);
        // Confident matches are pre-selected; uncertain ones wait for the user's OK.
        // Confident matches not already in the list are pre-selected; the rest wait for the user.
        setSelected(new Set(res.map((r, i) => (r.hit && r.confident && !listedRef.current(r) ? i : -1)).filter((i) => i >= 0)));
        setPhase('review');
      } catch {
        if (!cancelled) { setError('Could not read that file.'); setPhase('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [file, submitted]);

  const inList = (r: MatchResult) => !!r.hit && !!findDuplicate(existing, {
    title: r.hit.title, year: r.hit.year, type: r.hit.kind === 'tv' ? 'Series' : 'Film',
    imdbUrl: r.candidate.imdbId ? `https://www.imdb.com/title/${r.candidate.imdbId}/` : '', tmdbId: r.hit.id,
  });
  useEffect(() => { listedRef.current = inList; });

  const matched = useMemo(() => results.map((r, i) => ({ r, i })).filter(({ r }) => r.hit), [results]);
  const unsure = matched.filter(({ r }) => !r.confident);
  const sure = matched.filter(({ r }) => r.confident);
  const unmatched = results.filter((r) => !r.hit);

  const toggle = (i: number) => setSelected((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const confirm = () => onImport(
    [...selected].map((i) => results[i]).filter((r): r is MatchResult & { hit: MatchHit } => !!r?.hit)
      // A pasted list has no status per line: use the one chosen for all.
      .map((r) => toEntry(isText ? { ...r, candidate: { ...r.candidate, status: statusForAll } } : r)),
  );

  if (!source) return null;
  const sourceName = [...new Set(kinds.map((k) => SOURCE[k]))].join(' + ') || 'file';

  const row = ({ r, i }: { r: MatchResult; i: number }) => {
    const h = r.hit!;
    // Show what was typed only when it differs from the match (links have no typed title).
    const typed = r.candidate.title.trim();
    const differs = !!typed && (normalizeTitle(typed) !== normalizeTitle(h.title) || (!!r.candidate.year && r.candidate.year !== h.year));
    const listed = inList(r);
    return (
      <label key={i} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--bg-hover)]">
        <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="h-4 w-4 flex-shrink-0 accent-brand" />
        <span className="h-12 w-8 flex-shrink-0 overflow-hidden rounded" style={{ background: 'var(--bg-elevated)' }}>
          {h.posterPath ? <img src={`https://image.tmdb.org/t/p/w92${h.posterPath}`} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <Film className="m-2 h-4 w-4 opacity-30" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{h.title} <span style={{ color: 'var(--text-muted)' }}>{h.year}</span></span>
          <span className="block truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {listed && <span className="font-semibold text-amber-400">Already in your list · </span>}
            {differs ? <>From “{typed}”{r.candidate.year ? ` ${r.candidate.year}` : ''} · </> : null}
            {STATUS_LABEL[isText ? statusForAll : r.candidate.status]}
            {r.candidate.rating !== undefined && <> · {r.candidate.rating}/10</>}
            {r.candidate.watchedOn && <> · {formatWatchDate(r.candidate.watchedOn)}</>}
          </span>
        </span>
      </label>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="flex max-w-lg flex-col" aria-describedby={undefined}>
        <div className="p-6 pb-2 pr-12">
          <DialogTitle className="text-lg">{isText ? 'Add a list of titles' : `Import from ${sourceName}`}</DialogTitle>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {isText ? 'Paste from notes, chats or anywhere: one title per line. Years and IMDb/TMDB links help.' : file?.name}
          </p>
        </div>

        <div className="min-h-[120px] px-6 py-2">
          {phase === 'input' && (
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              autoFocus
              placeholder={'Inception (2010)\nBreaking Bad (series)\nhttps://www.imdb.com/title/tt0816692/\nPast Lives 2023'}
              className="font-mono text-xs"
            />
          )}

          {(phase === 'reading' || phase === 'matching') && (
            <div className="flex flex-col items-center gap-3 py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-text)]" />
              {phase === 'reading' ? 'Reading file…' : `Matching titles on TMDB… ${done}/${total}`}
              {phase === 'matching' && (
                <div className="h-1 w-48 overflow-hidden rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="h-full bg-brand transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
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
              {isText && (
                <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Add all as
                  {(['plan', 'watching', 'watched'] as WatchStatus[]).map((st) => (
                    <button
                      key={st} type="button" onClick={() => setStatusForAll(st)} aria-pressed={statusForAll === st}
                      className="rounded-md px-2 py-1 font-semibold"
                      style={statusForAll === st ? STATUS_CONFIG[st].style : { color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
                    >
                      {STATUS_CONFIG[st].label}
                    </button>
                  ))}
                </div>
              )}
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
          {phase === 'input' ? (
            <Button onClick={() => setSubmitted(text)} disabled={!text.trim()}>Find titles</Button>
          ) : (
            <Button onClick={confirm} disabled={phase !== 'review' || selected.size === 0}>
              {isText ? 'Add' : 'Import'} {phase === 'review' ? selected.size : ''} titles
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
