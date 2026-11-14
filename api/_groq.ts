/**
 * Groq transport, shared by the server (api/_ai.ts, with CineTrack's key) and the browser
 * (src/lib/ai.ts, with the user's own key, called directly so that key never reaches our server).
 * Pure: no Node or browser globals beyond `fetch` and `AbortSignal`.
 */

/** Tested with this app's prompts; fast, supports JSON mode. Used when nothing else is chosen. */
export const DEFAULT_MODEL = 'openai/gpt-oss-20b';
/** Tried in order. Groq retires models without much notice, so one gone model must not break the feature. */
export const DEFAULT_MODELS = [DEFAULT_MODEL, 'qwen/qwen3.8-27b'];

export const GROQ_URL = 'https://api.groq.com/openai/v1';

export interface GroqOptions {
  key: string;
  models: string[];
  system: string;
  user: string;                       // JSON text: the request is data, never spliced into instructions
  maxTokens?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}
export type GroqResult =
  | { ok: true; content: string; model: string }
  | { ok: false; status: number; tried: { model: string; status: number }[] };   // status 0 = network error or timeout

/** gpt-oss reasons first; "low" keeps it fast and leaves room for the JSON. Sent to gpt-oss models only. */
export function groqBody(model: string, system: string, user: string, maxTokens = 800): string {
  return JSON.stringify({
    model,
    temperature: 0,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
}

function timeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, t]) : t;
}

/**
 * Asks Groq for a JSON answer. A model that no longer exists (404), rejects the request (400) or is
 * overloaded (503) moves on to the next model; a bad key (401), the account's rate limit (429) or any
 * other answer stops immediately, since another model would not help.
 */
export async function callGroq(o: GroqOptions): Promise<GroqResult> {
  const fetchImpl = o.fetchImpl ?? fetch;
  const tried: { model: string; status: number }[] = [];
  for (const model of o.models) {
    let res: Response;
    try {
      res = await fetchImpl(`${GROQ_URL}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${o.key}`, 'content-type': 'application/json' },
        body: groqBody(model, o.system, o.user, o.maxTokens),
        signal: timeout(o.signal, o.timeoutMs ?? 12_000),
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError' && o.signal?.aborted) throw err;     // the caller gave up
      tried.push({ model, status: 0 });
      continue;
    }
    tried.push({ model, status: res.status });
    if (res.status === 404 || res.status === 400 || res.status === 503) continue;
    if (!res.ok) return { ok: false, status: res.status, tried };
    try {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return { ok: true, content: data.choices?.[0]?.message?.content ?? '', model };
    } catch {
      return { ok: false, status: 502, tried };
    }
  }
  return { ok: false, status: tried[tried.length - 1]?.status ?? 0, tried };
}

// ── Models the user can pick (browser, own key) ─────────────────────────────

export interface GroqModelInfo {
  id: string;
  name: string;
  owner: string;
  contextWindow: number;
  recommended: boolean;
}

interface RawModel {
  id?: string; name?: string; owned_by?: string; active?: boolean; context_window?: number;
  input_modalities?: string[]; output_modalities?: string[]; supported_features?: string[];
}

/**
 * Models this app can use: active, text in and out, and JSON mode (every feature asks for JSON). Guard,
 * safeguard, speech and text-to-speech models are left out. Groq's free plan covers them all with
 * rate limits, so "free" is not a property of a model.
 */
export function usableModels(raw: unknown): GroqModelInfo[] {
  const list = (raw as { data?: RawModel[] } | null)?.data;
  if (!Array.isArray(list)) return [];
  return list
    .filter((m): m is RawModel & { id: string } => typeof m?.id === 'string')
    .filter((m) => m.active !== false
      && (m.input_modalities ?? ['text']).includes('text') && (m.output_modalities ?? ['text']).includes('text')
      && (m.supported_features ?? []).includes('json_mode')
      && !/guard|safeguard|whisper|orpheus|tts|embed/i.test(m.id))
    .map((m) => ({ id: m.id, name: m.name || m.id, owner: m.owned_by ?? '', contextWindow: m.context_window ?? 0, recommended: m.id === DEFAULT_MODEL }))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.id.localeCompare(b.id));
}

export type KeyCheck = { ok: true; models: GroqModelInfo[] } | { ok: false; reason: 'rejected' | 'network' | 'unavailable' };

/** Checks a key by listing its models (also gives the picker its options). */
export async function checkKey(key: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<KeyCheck> {
  let res: Response;
  try { res = await fetchImpl(`${GROQ_URL}/models`, { headers: { authorization: `Bearer ${key}` }, signal: timeout(signal, 10_000) }); }
  catch { return { ok: false, reason: 'network' }; }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'rejected' };
  if (!res.ok) return { ok: false, reason: 'unavailable' };
  return { ok: true, models: usableModels(await res.json().catch(() => null)) };
}

/** Plausible Groq key shape (for a friendly early error; Groq has the final say). */
export const looksLikeGroqKey = (s: string) => /^gsk_[A-Za-z0-9]{20,}$/.test(s.trim());
