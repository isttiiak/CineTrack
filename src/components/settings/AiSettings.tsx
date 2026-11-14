import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, Sparkles, Trash2, XCircle } from 'lucide-react';
import { checkKey, looksLikeGroqKey, type GroqModelInfo } from '../../../api/_groq';
import {
  AI_MESSAGES, AiSearchError, DEFAULT_MODEL, clearOwnKey, getOwnKey, getSelectedModel, runAiTask, setOwnKey,
  setSelectedModel, useAiVersion,
} from '@/lib/ai';
import type { Preferences } from '@/hooks/usePreferences';
import type { UserProfile } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, Switch } from './parts';
import { outlineBtn } from './styles';

const GROQ_KEYS_URL = 'https://console.groq.com/keys';
const maskKey = (k: string) => `gsk_••••••••${k.slice(-4)}`;
const KEY_PROBLEMS = {
  shape: 'That does not look like a Groq key. It starts with gsk_ and has about 50 characters.',
  rejected: 'Groq rejected that key. Copy it again from the Groq console.',
  network: 'Could not reach Groq. Check your connection and try again.',
  unavailable: 'Groq is not answering right now. Try again in a moment.',
};

type ModelsState = { status: 'idle' | 'loading' | 'error'; models: GroqModelInfo[]; problem?: string };

/** Settings → AI: turn the AI buttons on or off, add your own Groq key and choose the model it uses. */
export function AiSettings({ prefs, onPrefChange, user }: { prefs: Preferences; onPrefChange: <K extends keyof Preferences>(k: K, v: Preferences[K]) => void; user: UserProfile | null }) {
  useAiVersion();                                           // re-render when the key or model changes
  const ownKey = getOwnKey();
  const selected = getSelectedModel();

  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [models, setModels] = useState<ModelsState>({ status: 'idle', models: [] });
  const [test, setTest] = useState<{ status: 'idle' | 'running' | 'ok' | 'fail'; message?: string }>({ status: 'idle' });

  const loadModels = useCallback(async (key: string) => {
    setModels((m) => ({ ...m, status: 'loading', problem: undefined }));
    const res = await checkKey(key);
    if ('models' in res) {
      setModels({ status: 'idle', models: res.models });
      // A chosen model that Groq has since retired falls back to the default instead of failing later.
      if (!res.models.some((m) => m.id === getSelectedModel())) setSelectedModel(DEFAULT_MODEL);
    } else {
      setModels({ status: 'error', models: [], problem: KEY_PROBLEMS[res.reason] });
    }
  }, []);

  useEffect(() => { if (ownKey) void loadModels(ownKey); }, [ownKey, loadModels]);

  const save = async () => {
    const key = input.trim();
    setProblem(null);
    if (!looksLikeGroqKey(key)) { setProblem(KEY_PROBLEMS.shape); return; }
    setSaving(true);
    const res = await checkKey(key);                         // proves the key works, and fills the model list
    setSaving(false);
    if (!('models' in res)) { setProblem(KEY_PROBLEMS[res.reason]); return; }
    setOwnKey(key);
    setInput('');
    setModels({ status: 'idle', models: res.models });
    setTest({ status: 'idle' });
  };

  const runTest = async () => {
    setTest({ status: 'running' });
    try {
      const r = await runAiTask('filter', { query: 'comedies i have not watched yet' }, { fresh: true });
      setTest(r.result ? { status: 'ok', message: `Works: “${r.result.summary || r.result.query}”` } : { status: 'fail', message: 'The model answered but not in a usable form. Try another model.' });
    } catch (err) {
      setTest({ status: 'fail', message: AI_MESSAGES[err instanceof AiSearchError ? err.code : 'unavailable'] });
    }
  };

  const options = models.models.length ? models.models : [{ id: selected, name: selected, owner: '', contextWindow: 0, recommended: selected === DEFAULT_MODEL }];

  return (
    <>
      <Card title="AI features" description="Natural-language search in Discover and your list, “What to watch tonight”, the taste summary and reading pasted text with AI. They only run when you click, and nothing is sent before that.">
        <Switch label="Show AI features" description="Turn off to hide every AI button" checked={prefs.aiFeatures} onChange={(v) => onPrefChange('aiFeatures', v)} />
      </Card>

      <Card
        title="Your own Groq key"
        description={<>Optional. With your own free key the app talks to Groq straight from this browser: no daily limit from CineTrack, no sign-in needed, and the key never reaches CineTrack's servers. Groq's free plan has its own limits.{' '}
          <a href={GROQ_KEYS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline hover:text-[var(--text-primary)]">Get a key <ExternalLink className="h-3 w-3" /></a></>}
      >
        <div className="space-y-3 p-3">
          {ownKey ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-sm" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
                <KeyRound className="h-4 w-4" style={{ color: 'var(--accent-text)' }} /> {maskKey(ownKey)}
              </span>
              <button className={outlineBtn} style={{ borderColor: 'var(--border-subtle)', color: '#f87171' }} onClick={() => { clearOwnKey(); setModels({ status: 'idle', models: [] }); setTest({ status: 'idle' }); }}>
                <Trash2 className="h-4 w-4" /> Remove key
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password" value={input} onChange={(e) => setInput(e.target.value)}
                placeholder="gsk_…" aria-label="Groq API key"
                autoComplete="off" autoCapitalize="off" spellCheck={false} data-1p-ignore data-lpignore="true"
                className="h-10 min-w-0 flex-1 rounded-lg border bg-transparent px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-brand/40"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <Button type="submit" disabled={saving || !input.trim()} className="h-10">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Save key
              </Button>
            </form>
          )}
          {problem && <p role="alert" className="text-sm text-red-400">{problem}</p>}
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Stored in this browser only: not in your account, not synced to other devices, not in backups. Anyone using this
            browser profile can use it, so remove it on a shared computer. Browsers can't hide a stored key from the page itself;
            CineTrack's strict content-security policy is what protects it. You can revoke the key any time in the Groq console.
          </p>
        </div>
      </Card>

      {ownKey ? (
        <Card title="Model" description="Models your key can use that support the JSON answers this app needs. Groq's free plan covers them all with rate limits; check console.groq.com/settings/limits for yours.">
          <div className="space-y-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selected} onValueChange={setSelectedModel} disabled={models.status === 'loading'}>
                <SelectTrigger className="h-10 w-full max-w-md text-sm sm:w-auto sm:min-w-[18rem]" aria-label="AI model"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name === m.id ? m.id : `${m.name} · ${m.id}`}{m.recommended ? ' (recommended)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button className={outlineBtn} style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }} onClick={() => void loadModels(ownKey)} disabled={models.status === 'loading'}>
                {models.status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reload list
              </button>
            </div>
            {models.status === 'error' && <p role="alert" className="text-sm text-amber-400">{models.problem} Showing your current choice.</p>}
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              The default, <span className="font-mono">{DEFAULT_MODEL}</span>, is the one this app is tested with: quick and reliable at turning a request into filters.
              If a model is retired, the app falls back to it automatically.
              {selected !== DEFAULT_MODEL && <> <button className="underline hover:text-[var(--text-primary)]" onClick={() => setSelectedModel(DEFAULT_MODEL)}>Use the default</button></>}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => void runTest()} disabled={test.status === 'running'}>
                {test.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Test AI
              </Button>
              {test.status === 'ok' && <span className="flex items-center gap-1.5 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" />{test.message}</span>}
              {test.status === 'fail' && <span role="alert" className="flex items-center gap-1.5 text-sm text-red-400"><XCircle className="h-4 w-4" />{test.message}</span>}
            </div>
          </div>
        </Card>
      ) : (
        <Card title="Without your own key">
          <p className="p-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {user
              ? 'You are signed in, so you can use CineTrack\'s shared AI: a small number of requests a day (it shows how many are left). The model is chosen by CineTrack.'
              : 'Sign in with Google to use CineTrack\'s shared AI with a small daily allowance, or add your own free Groq key above to use AI without signing in.'}
          </p>
        </Card>
      )}

      <Card title="What AI sees" description="Only what you click AI on, sent to Groq (directly with your key, or through CineTrack's server with the shared one):">
        <ul className="list-disc space-y-1 px-8 pb-3 pt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li><b>Ask AI</b> (Discover) and <b>filter</b> (your list): the sentence you typed.</li>
          <li><b>Tonight</b>: your mood plus titles, years, genres and ratings from your Plan to Watch list (not notes, dates or links).</li>
          <li><b>Taste summary</b>: counts of your genres, decades and countries, your average rating, and the titles you rated 9 or 10.</li>
          <li><b>Read with AI</b>: the text you pasted.</li>
        </ul>
        <p className="px-3 pb-3 text-xs" style={{ color: 'var(--text-muted)' }}>Never your notes, links, account details or key. Groq handles it under its own terms.</p>
      </Card>
    </>
  );
}
