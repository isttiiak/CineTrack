import { useSyncExternalStore } from 'react';
import { DEFAULT_MODEL, DEFAULT_MODELS, callGroq } from '../../api/_groq';
import { TASKS, type TaskIO, type TaskName } from '../../api/_aiTasks';

/**
 * AI for the app, in one place. Two ways to be served:
 *  - own key: the user pasted their own Groq key (Settings → AI). The browser calls Groq directly, so
 *    the key never reaches CineTrack's server, there is no allowance from us and no sign-in is needed;
 *    Groq's own free-tier limits apply to their key.
 *  - shared: CineTrack's key through /api/ai, for signed-in users, with a small daily allowance.
 * Every feature goes through `runAiTask`, which picks the way and returns the same thing either way.
 */

export { DEFAULT_MODEL };

const KEY_KEY = 'cinetrack_ai_key';        // the user's Groq key: this browser only, never synced or sent to us
const MODEL_KEY = 'cinetrack_ai_model';
const CACHE_KEY = 'cinetrack_ai_cache';

// ── Settings (reactive) ─────────────────────────────────────────────────────

let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((l) => l()); };
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode: lasts for this session only */ }
};

export const getOwnKey = (): string | null => read(KEY_KEY) || null;
export const getSelectedModel = (): string => read(MODEL_KEY) || DEFAULT_MODEL;
export function setOwnKey(key: string) { write(KEY_KEY, key.trim()); emit(); }
export function clearOwnKey() { write(KEY_KEY, null); write(MODEL_KEY, null); emit(); }   // forgetting the key forgets the model choice too
export function setSelectedModel(model: string) { write(MODEL_KEY, model === DEFAULT_MODEL ? null : model); emit(); }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useAiVersion = (): number => useSyncExternalStore(subscribe, () => version, () => version);

export type AiMode = 'own' | 'shared' | 'none';
/** How AI would be served right now. 'none': no own key and not signed in. */
export const aiMode = (signedIn: boolean): AiMode => (getOwnKey() ? 'own' : signedIn ? 'shared' : 'none');

/** The chosen model first, then the known-good ones, so a retired model still ends in an answer. */
export const modelsToTry = (selected: string): string[] => [selected, ...DEFAULT_MODELS.filter((m) => m !== selected)];

// ── Errors ──────────────────────────────────────────────────────────────────

export type AiErrorCode = 'signin' | 'limit' | 'slow_down' | 'busy' | 'unavailable' | 'not_configured' | 'bad_query' | 'bad_key';
export class AiSearchError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode) { super(code); this.code = code; }
}

export const AI_MESSAGES: Record<AiErrorCode, string> = {
  signin: 'Sign in, or add your own Groq key in Settings → AI, to use AI.',
  limit: 'You have used today\'s AI requests. They reset at midnight UTC. Add your own Groq key in Settings → AI to go on; the regular search still works.',
  slow_down: 'A few too many requests in a row. Wait a minute and try again.',
  busy: 'AI is busy right now (Groq\'s free limit). Try again shortly; everything else still works.',
  unavailable: 'AI is unavailable right now. Everything else still works.',
  not_configured: 'Shared AI is not set up on this copy of the app. Add your own Groq key in Settings → AI.',
  bad_query: 'Describe it in a few words (3 to 200 characters).',
  bad_key: 'Groq rejected your API key. Check or replace it in Settings → AI.',
};

// ── Cache for requests that carry none of the user's list ───────────────────

const CACHE_TTL_MS = 7 * 86_400_000;
const CACHE_MAX = 30;
type CacheFile = Record<string, { result: unknown; at: number }>;
const readCache = (): CacheFile => { try { return JSON.parse(read(CACHE_KEY) ?? '{}') as CacheFile; } catch { return {}; } };
function writeCache(key: string, result: unknown) {
  const file = readCache();
  file[key] = { result, at: Date.now() };
  const fresh = Object.entries(file).filter(([, v]) => Date.now() - v.at < CACHE_TTL_MS).sort((a, b) => b[1].at - a[1].at).slice(0, CACHE_MAX);
  write(CACHE_KEY, JSON.stringify(Object.fromEntries(fresh)));
}
const cacheKeyFor = (task: string, query: string) => `${task}:${query.toLowerCase().replace(/\s+/g, ' ').trim()}`;

// ── Running a task ──────────────────────────────────────────────────────────

export interface TaskRun<K extends TaskName> {
  result: TaskIO[K]['out'] | null;      // null: the model answered but nothing usable came back
  remaining: number | null;             // shared mode only
  limit: number | null;
  mode: 'own' | 'shared';
  cached: boolean;
}

/**
 * Runs one AI task. Throws AiSearchError (with a code the UI maps to a message), or AbortError when
 * the caller cancels. `fresh` skips the local cache (used by "Test").
 */
export async function runAiTask<K extends TaskName>(
  name: K, input: TaskIO[K]['in'], opts: { signal?: AbortSignal; fresh?: boolean } = {},
): Promise<TaskRun<K>> {
  const def = TASKS[name] as unknown as {
    system(now: Date): string; user(i: unknown): string; parse(raw: unknown, i: unknown, now: Date): unknown; maxTokens: number; cacheable: boolean;
  };
  const ownKey = getOwnKey();
  const cacheKey = def.cacheable ? cacheKeyFor(name, (input as { query: string }).query) : null;

  if (cacheKey && !opts.fresh) {
    const hit = readCache()[cacheKey];
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { result: hit.result as TaskRun<K>['result'], remaining: null, limit: null, mode: ownKey ? 'own' : 'shared', cached: true };
  }

  if (ownKey) {
    const now = new Date();
    const answer = await callGroq({
      key: ownKey, models: modelsToTry(getSelectedModel()),
      system: def.system(now), user: def.user(input), maxTokens: def.maxTokens,
      signal: opts.signal, timeoutMs: name === 'paste' ? 40_000 : 20_000,
    });
    if ('tried' in answer) {
      if (answer.status === 401 || answer.status === 403) throw new AiSearchError('bad_key');
      throw new AiSearchError(answer.status === 429 || answer.status === 503 ? 'busy' : 'unavailable');
    }
    let result: unknown = null;
    try { result = def.parse(JSON.parse((answer as { content: string }).content), input, now); } catch { result = null; }
    if (cacheKey) writeCache(cacheKey, result);
    return { result: result as TaskRun<K>['result'], remaining: null, limit: null, mode: 'own', cached: false };
  }

  const { auth, getAppCheckToken } = await import('./firebase');            // lazy: keeps this module free of Firebase for tests
  const user = auth.currentUser;
  if (!user) throw new AiSearchError('signin');
  let res: Response;
  try {
    const [token, appCheck] = await Promise.all([user.getIdToken(), getAppCheckToken()]);
    res = await fetch('/api/ai', {
      method: 'POST',
      // The App Check token is passed on to Firestore by the server (api/_ai.ts), so App Check can be enforced there.
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(appCheck ? { 'x-firebase-appcheck': appCheck } : {}) },
      body: JSON.stringify({ task: name, input }),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new AiSearchError('unavailable');
  }
  const body = (await res.json().catch(() => ({}))) as { result?: unknown; remaining?: number | null; limit?: number | null; error?: string };
  if (!res.ok) {
    if (res.status === 401) throw new AiSearchError('signin');
    if (res.status === 429) throw new AiSearchError(body.error === 'slow_down' ? 'slow_down' : 'limit');
    if (res.status === 409) throw new AiSearchError('busy');
    if (res.status === 400) throw new AiSearchError('bad_query');
    if (body.error === 'not_configured') throw new AiSearchError('not_configured');
    throw new AiSearchError(res.status === 503 ? 'busy' : 'unavailable');
  }
  const result = body.result ?? null;
  if (cacheKey) writeCache(cacheKey, result);
  return { result: result as TaskRun<K>['result'], remaining: body.remaining ?? null, limit: body.limit ?? null, mode: 'shared', cached: false };
}
