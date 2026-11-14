import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiSearchError, DEFAULT_MODEL, aiMode, clearOwnKey, getOwnKey, getSelectedModel, modelsToTry, runAiTask, setOwnKey, setSelectedModel,
} from './ai';

const KEY = 'gsk_' + 'a'.repeat(52);

/** A tiny in-memory localStorage (the test environment is plain node). */
function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, _m: m };
}
const chat = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });

let storage: ReturnType<typeof fakeStorage>;
beforeEach(() => { storage = fakeStorage(); vi.stubGlobal('localStorage', storage); });
afterEach(() => vi.unstubAllGlobals());

describe('own key and model settings', () => {
  it('stores, reads and forgets the key, and the model choice with it', () => {
    expect(getOwnKey()).toBeNull();
    setOwnKey(`  ${KEY}  `);
    expect(getOwnKey()).toBe(KEY);
    setSelectedModel('qwen/qwen3.8-27b');
    expect(getSelectedModel()).toBe('qwen/qwen3.8-27b');
    clearOwnKey();
    expect(getOwnKey()).toBeNull();
    expect(getSelectedModel()).toBe(DEFAULT_MODEL);
  });
  it('treats the default as "no choice", so a future change of default reaches everyone who never chose', () => {
    setSelectedModel('qwen/qwen3.8-27b');
    setSelectedModel(DEFAULT_MODEL);
    expect(storage._m.has('cinetrack_ai_model')).toBe(false);
  });
  it('stays under the cinetrack_ prefix, so "Erase everything" removes it', () => {
    setOwnKey(KEY); setSelectedModel('x/y');
    for (const k of storage._m.keys()) expect(k.startsWith('cinetrack_'), k).toBe(true);
  });
  it('picks the mode: own key wins, else sign-in, else none', () => {
    expect(aiMode(false)).toBe('none');
    expect(aiMode(true)).toBe('shared');
    setOwnKey(KEY);
    expect(aiMode(false)).toBe('own');
    expect(aiMode(true)).toBe('own');
  });
  it('tries the chosen model first, then the known-good ones', () => {
    expect(modelsToTry('my/model')[0]).toBe('my/model');
    expect(modelsToTry(DEFAULT_MODEL)).toEqual([DEFAULT_MODEL, 'qwen/qwen3.8-27b']);
    expect(new Set(modelsToTry('qwen/qwen3.8-27b')).size).toBe(modelsToTry('qwen/qwen3.8-27b').length);
  });
});

describe('runAiTask with an own key', () => {
  it('calls Groq directly with the key, the chosen model first, and never CineTrack\'s server', async () => {
    setOwnKey(KEY); setSelectedModel('qwen/qwen3.8-27b');
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => chat({ query: 'genre:comedy status:plan', summary: 'Unwatched comedies' }));
    vi.stubGlobal('fetch', fetchMock);
    const run = await runAiTask('filter', { query: 'comedies i have not seen' });
    expect(run).toMatchObject({ mode: 'own', cached: false, remaining: null, limit: null, result: { query: 'genre:comedy status:plan' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body as string).model).toBe('qwen/qwen3.8-27b');
    expect(String(init.body)).not.toContain(KEY);
    expect(fetchMock.mock.calls.every(([u]) => !u.includes('/api/ai'))).toBe(true);
  });

  it('maps a rejected key and rate limits to clear errors', async () => {
    setOwnKey(KEY);
    for (const [status, code] of [[401, 'bad_key'], [403, 'bad_key'], [429, 'busy'], [500, 'unavailable']] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));
      await expect(runAiTask('filter', { query: `request ${status}` }), String(status)).rejects.toMatchObject({ code });
    }
    expect(new AiSearchError('bad_key')).toBeInstanceOf(Error);
  });

  it('caches answers that carry none of the list, but never ones that do', async () => {
    setOwnKey(KEY);
    const fetchMock = vi.fn(async () => chat({ query: 'type:film', summary: 'Films' }));
    vi.stubGlobal('fetch', fetchMock);
    await runAiTask('filter', { query: 'Some Films please' });
    const again = await runAiTask('filter', { query: 'some films   please' });
    expect(again.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await runAiTask('filter', { query: 'some films please' }, { fresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const tonight = vi.fn(async () => chat({ picks: [{ i: 0, why: 'Light' }], note: '' }));
    vi.stubGlobal('fetch', tonight);
    const input = { mood: 'light', candidates: [{ i: 0, t: 'A', y: '2020', g: 'Comedy', m: 90, k: 'film' as const, r: 7 }] };
    await runAiTask('tonight', input); await runAiTask('tonight', input);
    expect(tonight).toHaveBeenCalledTimes(2);
    expect(storage.getItem('cinetrack_ai_cache') ?? '').not.toContain('Comedy');             // the list never lands in the cache
  });

  it('turns an unusable model answer into a null result, not an error', async () => {
    setOwnKey(KEY);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }), { status: 200 })));
    expect((await runAiTask('filter', { query: 'whatever you like' })).result).toBeNull();
  });

  it('falls through a retired model to the next one', async () => {
    setOwnKey(KEY); setSelectedModel('retired/model');
    const tried: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      const model = JSON.parse(init.body as string).model; tried.push(model);
      return model === 'retired/model' ? new Response('{}', { status: 404 }) : chat({ query: 'type:film', summary: 'Films' });
    }));
    expect((await runAiTask('filter', { query: 'films only please' })).result).toMatchObject({ query: 'type:film' });
    expect(tried).toEqual(['retired/model', DEFAULT_MODEL]);
  });
});
