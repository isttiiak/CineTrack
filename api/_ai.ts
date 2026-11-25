/**
 * AI core for the server, shared by the Vercel function (api/ai.ts) and the Vite dev/preview server.
 * (Files starting with "_" in api/ are not deployed as functions.)
 *
 * This is the "shared key" path: CineTrack's Groq key, signed-in users only, a small daily allowance.
 * (Users with their own Groq key skip it: the browser calls Groq directly, src/lib/ai.ts.) What the
 * model is asked to do, and how its answer is validated, lives in api/_aiTasks.ts.
 *
 * Who may call it: signed-in users only, a few times a day. Instead of verifying Firebase tokens
 * ourselves, the function reads and writes the user's usage counter *as that user* (Firestore REST,
 * with their ID token): Firestore rejects a forged or expired token, and firestore.rules enforce
 * "one more per call, never above the cap, resets each UTC day". The shared Groq key is therefore never
 * reachable without a real account, and one account can't exceed its allowance. The allowance is read
 * first and spent only after the model has answered, so a failed call costs the user nothing.
 *
 * App Check: when it is enforced for Cloud Firestore, those REST calls need an App Check token too. The
 * browser sends its own in the `X-Firebase-AppCheck` header and it is forwarded to Firestore (see
 * `quotaHeaders`), so enforcement protects the shared Groq key as well: a script without a real app token
 * gets a 403 from Firestore and never reaches the model.
 */

import { DEFAULT_MODELS, callGroq } from './_groq.js';
import { TASKS, TASK_NAMES, type TaskName } from './_aiTasks.js';

// Re-exported so the browser and the tests have one import path for the task definitions.
export { GENRE_NAMES, parsePlan, systemPrompt, type AiPlan } from './_aiTasks.js';
export { DEFAULT_MODELS } from './_groq.js';

// ── Quota: a per-user counter in Firestore, written as the user ──────────────

export type QuotaFailure = 'unauthenticated' | 'limit' | 'busy' | 'unavailable';
export class QuotaError extends Error {
  reason: QuotaFailure;
  constructor(reason: QuotaFailure) { super(reason); this.reason = reason; }
}

/** UTC day as the rules compute it from request.time: no zero padding. */
export const utcDay = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;

/** The Firebase uid from an ID token. Not a verification (Firestore verifies it); only used to address the user's own document. */
export function uidFromToken(token: string, projectId: string, now: Date = new Date()): string | null {
  const part = token.split('.')[1];
  if (!part || token.split('.').length !== 3) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    const uid = payload?.sub;
    if (typeof uid !== 'string' || !/^[A-Za-z0-9]{6,128}$/.test(uid)) return null;
    if (payload.aud !== projectId) return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < now.getTime()) return null;
    return uid;
  } catch { return null; }
}

interface FsDoc { fields?: { day?: { stringValue?: string }; count?: { integerValue?: string } }; updateTime?: string }

interface QuotaReading { count: number; today: string; precondition: string; appCheck?: string }

/**
 * Step 1: proves the token is real (Firestore refuses it otherwise) and checks the allowance, without
 * spending it. The allowance is only spent after the model has answered (`commitQuota`), so a failed
 * call never costs the user anything.
 */
export async function readQuota(
  token: string, uid: string, projectId: string, limit: number, fetchImpl: typeof fetch, now: Date, appCheck?: string,
): Promise<QuotaReading> {
  const today = utcDay(now);
  let res: Response;
  try { res = await fetchImpl(quotaUrl(uid, projectId), { headers: quotaHeaders(token, appCheck) }); } catch { throw new QuotaError('unavailable'); }
  let doc: FsDoc | null = null;
  if (res.status === 401) throw new QuotaError('unauthenticated');
  if (res.status === 403) throw new QuotaError('unavailable');      // rules not published yet, or App Check enforced and no valid token was forwarded
  if (res.status === 200) doc = (await res.json()) as FsDoc;
  else if (res.status !== 404) throw new QuotaError('unavailable');

  const count = doc?.fields?.day?.stringValue === today ? parseInt(doc?.fields?.count?.integerValue ?? '0', 10) || 0 : 0;
  if (count >= limit) throw new QuotaError('limit');
  // The precondition makes two simultaneous calls from one account race on the same version: one loses.
  const precondition = doc?.updateTime ? `currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}` : 'currentDocument.exists=false';
  return { count, today, precondition, appCheck };
}

/** Step 2: spends one request. Resolves with how many are left. Throws QuotaError. */
export async function commitQuota(
  token: string, uid: string, projectId: string, limit: number, reading: QuotaReading, fetchImpl: typeof fetch,
): Promise<{ used: number; remaining: number }> {
  const next = reading.count + 1;
  let res: Response;
  try {
    res = await fetchImpl(`${quotaUrl(uid, projectId)}?${reading.precondition}`, {
      method: 'PATCH', headers: quotaHeaders(token, reading.appCheck),
      body: JSON.stringify({ fields: { day: { stringValue: reading.today }, count: { integerValue: String(next) } } }),
    });
  } catch { throw new QuotaError('unavailable'); }
  if (res.status === 401) throw new QuotaError('unauthenticated');
  if (res.status === 403) throw new QuotaError('limit');            // the rules refused: at the cap
  if (res.status === 409 || res.status === 400) throw new QuotaError('busy');
  if (!res.ok) throw new QuotaError('unavailable');
  return { used: next, remaining: Math.max(0, limit - next) };
}

const quotaUrl = (uid: string, projectId: string) =>
  `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${uid}/data/aiUsage`;
/**
 * `appCheck` is the App Check token the browser sent along. Firestore checks it itself when App Check is
 * enforced for Cloud Firestore (a server has no App Check token of its own), so it is forwarded as-is and
 * only to Firestore. It is not verified here and never logged or stored.
 */
const quotaHeaders = (token: string, appCheck?: string): Record<string, string> => ({
  authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(appCheck ? { 'x-firebase-appcheck': appCheck } : {}),
});

/** The App Check token from the request, if it at least looks like one (a JWT, bounded size). Otherwise nothing is forwarded. */
export function appCheckFromRequest(request: Request): string | undefined {
  const value = request.headers.get('x-firebase-appcheck')?.trim();
  return value && value.length <= 4096 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(value) ? value : undefined;
}

// ── Request handler ─────────────────────────────────────────────────────────

export interface AiDeps {
  groqKey?: string;
  /** Models to try in order. Groq retires models without much notice, so a retired one must not take the feature down. */
  models?: string[];
  projectId?: string;
  dailyLimit?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

const MAX_BODY = 24_000;
const normalizeQuery = (q: string) => q.toLowerCase().replace(/\s+/g, ' ').trim();

// Per server instance (best effort, not shared between instances): a burst limit per user and a small
// cache of answered requests. A cache hit costs no Groq call and no allowance. Only tasks that carry
// none of the user's list are cached.
const burst = new Map<string, number[]>();
const cache = new Map<string, unknown>();
const BURST_MAX = 6, BURST_WINDOW_MS = 60_000, CACHE_MAX = 200;

/** @internal test helper */
export function resetAiState() { burst.clear(); cache.clear(); }

export async function handleAiRequest(request: Request, deps: AiDeps): Promise<Response> {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { allow: 'POST', 'content-type': 'application/json' } });
  if (!deps.groqKey || !deps.projectId) return json(503, { error: 'not_configured' });
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now?.() ?? new Date();
  const limit = Math.min(100, Math.max(1, deps.dailyLimit ?? 20));

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  const uid = token ? uidFromToken(token, deps.projectId, now) : null;
  if (!token || !uid) return json(401, { error: 'signin' });

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json(400, { error: 'bad_query' });
    body = JSON.parse(text) as Record<string, unknown>;
  } catch { /* handled below */ }

  // `{task, input}`; the original `{query}` form means the search task.
  const taskName = (typeof body.task === 'string' ? body.task : 'search') as TaskName;
  if (!TASK_NAMES.includes(taskName)) return json(400, { error: 'bad_task' });
  const task = TASKS[taskName] as (typeof TASKS)[TaskName];
  const input = (task.validate as (raw: unknown) => unknown)('input' in body ? body.input : body);
  if (input === null || input === undefined) return json(400, { error: 'bad_query' });

  const key = task.cacheable ? `${taskName}:${normalizeQuery((input as { query: string }).query)}` : null;
  const reply = (result: unknown, remaining: number | null) =>
    json(200, { result, ...(taskName === 'search' ? { plan: result } : {}), remaining, limit });
  if (key && cache.has(key)) return reply(cache.get(key), null);

  const recent = (burst.get(uid) ?? []).filter((t) => now.getTime() - t < BURST_WINDOW_MS);
  if (recent.length >= BURST_MAX) return json(429, { error: 'slow_down' });
  burst.set(uid, [...recent, now.getTime()]);

  let reading: QuotaReading;
  try {
    reading = await readQuota(token, uid, deps.projectId, limit, fetchImpl, now, appCheckFromRequest(request));
  } catch (err) {
    return quotaFailure(err, limit);
  }

  const answer = await callGroq({
    key: deps.groqKey,
    models: deps.models?.length ? deps.models : DEFAULT_MODELS,
    system: (task.system as (now: Date) => string)(now),
    user: (task.user as (i: unknown) => string)(input),
    maxTokens: task.maxTokens,
    fetchImpl,
    timeoutMs: taskName === 'paste' ? 25_000 : 12_000,
  });
  if ('tried' in answer) {
    // Visible in the Vercel logs: which model said what. Never the key, the token or the request.
    console.error('AI search failed:', answer.tried.map((t) => `${t.model} ${t.status}`).join(', '));
    if (answer.status === 429) return json(503, { error: 'busy', upstream: 429 });          // Groq's own free-tier limit
    return json(502, { error: 'unavailable', upstream: answer.status });
  }

  let result: unknown = null;
  try {
    result = (task.parse as (raw: unknown, input: unknown, now: Date) => unknown)(JSON.parse((answer as { content: string }).content), input, now);
  } catch { result = null; }

  // The model answered: now the request counts. (If this loses a race or hits the cap, the answer is withheld.)
  let quota: { used: number; remaining: number };
  try {
    quota = await commitQuota(token, uid, deps.projectId, limit, reading, fetchImpl);
  } catch (err) {
    return quotaFailure(err, limit);
  }

  if (key) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, result);
  }
  return reply(result, quota.remaining);
}

function quotaFailure(err: unknown, limit: number): Response {
  const reason = err instanceof QuotaError ? err.reason : 'unavailable';
  if (reason === 'unauthenticated') return json(401, { error: 'signin' });
  if (reason === 'limit') return json(429, { error: 'limit', limit });
  if (reason === 'busy') return json(409, { error: 'busy' });
  return json(503, { error: 'quota_unavailable' });
}
