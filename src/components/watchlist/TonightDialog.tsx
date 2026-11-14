import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, Loader2, LogIn, Moon, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PosterThumb } from './PosterThumb';
import { AI_MESSAGES, AiSearchError, aiMode, runAiTask, useAiVersion } from '@/lib/ai';
import { buildTonight } from '@/lib/aiFeatures';
import { track } from '@/lib/analytics';
import type { MovieEntry, WatchlistState } from '@/types';

const MOODS = ['Light and funny', 'Mind-bending', 'Something short', 'Edge of my seat', 'Cosy and gentle', 'Surprise me'];

interface Pick { entry: MovieEntry; why: string }

interface Props {
  open: boolean;
  onClose: () => void;
  state: WatchlistState;
  signedIn: boolean;
  onOpenEntry: (id: string) => void;
  onSignIn: () => void;
  onOpenAiSettings: () => void;
}

/**
 * "What should I watch tonight?": the user says what they're in the mood for, AI picks up to three
 * titles from THEIR OWN list. Ids are checked against the list, so it can't suggest something that
 * isn't there.
 */
export function TonightDialog({ open, onClose, state, signedIn, onOpenEntry, onSignIn, onOpenAiSettings }: Props) {
  useAiVersion();
  const mode = aiMode(signedIn);
  const { candidates, entryIds } = useMemo(() => buildTonight(state), [state]);
  const [mood, setMood] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);

  useEffect(() => { if (!open) { controller.current?.abort(); setStatus('idle'); setPicks([]); setNote(''); setError(''); } }, [open]);

  const ask = async () => {
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setStatus('loading'); setError('');
    try {
      const { result } = await runAiTask('tonight', { mood: mood.trim(), candidates }, { signal: ctl.signal });
      const byId = new Map(state.entries.map((e) => [e.id, e]));
      const found = (result?.picks ?? []).flatMap((p) => {
        const entry = byId.get(entryIds[p.i]);
        return entry ? [{ entry, why: p.why }] : [];
      });
      track('ai_search', { ok: found.length ? 1 : 0 });
      setPicks(found); setNote(result?.note ?? ''); setStatus('done');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(AI_MESSAGES[err instanceof AiSearchError ? err.code : 'unavailable']);
      setStatus('error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <div className="p-6">
          <div className="mb-1 flex items-center gap-2 pr-8">
            <Moon className="h-5 w-5" style={{ color: 'var(--accent-text)' }} />
            <DialogTitle className="text-lg">What should I watch tonight?</DialogTitle>
          </div>
          <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            AI chooses from your own list of {candidates.length} title{candidates.length === 1 ? '' : 's'} still to watch.
          </p>

          {candidates.length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing left to pick from. Add a few titles to Plan to Watch first.</p>
          ) : mode === 'none' ? (
            <div className="space-y-3 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <p>Sign in, or add your own free Groq key, to use AI.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => { onClose(); onSignIn(); }}><LogIn className="h-4 w-4" /> Sign in</Button>
                <Button variant="outline" onClick={() => { onClose(); onOpenAiSettings(); }}><KeyRound className="h-4 w-4" /> Use my own key</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void ask(); }}>
              <input
                value={mood} onChange={(e) => setMood(e.target.value)} maxLength={120}
                placeholder="What are you in the mood for? (optional)" aria-label="Your mood"
                className="h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MOODS.map((m) => (
                  <button
                    key={m} type="button" onClick={() => setMood(m === 'Surprise me' ? '' : m)}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                  >{m}</button>
                ))}
              </div>
              <Button type="submit" className="mt-4 w-full" disabled={status === 'loading'}>
                {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {picks.length ? 'Pick again' : 'Pick for me'}
              </Button>
              <p className="mt-2 text-[11px]" style={{ color: 'var(--text-disabled)' }}>
                Sends your mood and the titles, years, genres and ratings of this list to Groq. Never notes or links.
              </p>
            </form>
          )}

          {status === 'error' && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

          {status === 'done' && (
            <div className="mt-5 space-y-2" aria-live="polite">
              {picks.length === 0 && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{note || 'AI could not pick anything. Try describing the mood differently.'}</p>}
              {picks.map(({ entry, why }) => (
                <button
                  key={entry.id}
                  onClick={() => { onClose(); onOpenEntry(entry.id); }}
                  className="flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <PosterThumb title={entry.title} year={entry.year} type={entry.type} tmdbId={entry.tmdbId} posterUrl={entry.posterUrl} size="w92" className="h-20 w-14" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{entry.title} <span className="font-normal" style={{ color: 'var(--text-muted)' }}>{entry.year}</span></span>
                    <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>{why}</span>
                  </span>
                </button>
              ))}
              {picks.length > 0 && note && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{note}</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
