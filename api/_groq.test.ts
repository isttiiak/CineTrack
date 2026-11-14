import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODEL, callGroq, checkKey, groqBody, looksLikeGroqKey, usableModels } from './_groq';

const chat = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const base = { key: 'gsk_x', system: 's', user: '{}' };

describe('groqBody', () => {
  it('asks for JSON, and for low reasoning effort from gpt-oss models only', () => {
    expect(JSON.parse(groqBody('openai/gpt-oss-20b', 's', 'u'))).toMatchObject({ response_format: { type: 'json_object' }, reasoning_effort: 'low', temperature: 0, max_tokens: 800 });
    expect(JSON.parse(groqBody('qwen/qwen3.8-27b', 's', 'u', 3000))).not.toHaveProperty('reasoning_effort');
    expect(JSON.parse(groqBody('qwen/qwen3.8-27b', 's', 'u', 3000)).max_tokens).toBe(3000);
  });
});

describe('callGroq', () => {
  it('returns the content and the model that answered', async () => {
    const fetchImpl = vi.fn(async () => chat('{"a":1}')) as unknown as typeof fetch;
    expect(await callGroq({ ...base, models: ['m1'], fetchImpl })).toEqual({ ok: true, content: '{"a":1}', model: 'm1' });
  });

  it('moves past models that are gone, rejected or overloaded, but not past a bad key or a rate limit', async () => {
    const statuses: Record<string, number> = { a: 404, b: 400, c: 503, d: 200 };
    const seen: string[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => { const m = JSON.parse(init.body as string).model; seen.push(m); return statuses[m] === 200 ? chat('{}') : new Response('x', { status: statuses[m] }); }) as unknown as typeof fetch;
    expect((await callGroq({ ...base, models: ['a', 'b', 'c', 'd'], fetchImpl }))).toMatchObject({ ok: true, model: 'd' });
    expect(seen).toEqual(['a', 'b', 'c', 'd']);

    for (const status of [401, 429, 500]) {
      const calls: string[] = [];
      const f = (async (_u: string, init: RequestInit) => { calls.push(JSON.parse(init.body as string).model); return new Response('x', { status }); }) as unknown as typeof fetch;
      const r = await callGroq({ ...base, models: ['m1', 'm2'], fetchImpl: f });
      expect(r).toMatchObject({ ok: false, status });
      expect(calls).toEqual(['m1']);                            // another model would not help
    }
  });

  it('reports the last status when every model fails, 0 for a network error', async () => {
    const down = (async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
    expect(await callGroq({ ...base, models: ['m1', 'm2'], fetchImpl: down })).toMatchObject({ ok: false, status: 0, tried: [{ model: 'm1', status: 0 }, { model: 'm2', status: 0 }] });
    const gone = (async () => new Response('x', { status: 404 })) as unknown as typeof fetch;
    expect(await callGroq({ ...base, models: ['m1', 'm2'], fetchImpl: gone })).toMatchObject({ ok: false, status: 404 });
  });

  it('sends the key only to Groq, as a Bearer header', async () => {
    const fetchImpl = vi.fn(async () => chat('{}'));
    await callGroq({ ...base, models: ['m1'], fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer gsk_x');
    expect(String(init.body)).not.toContain('gsk_x');
  });
});

describe('usableModels', () => {
  const list = { data: [
    { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', owned_by: 'OpenAI', active: true, context_window: 131072, input_modalities: ['text'], output_modalities: ['text'], supported_features: ['json_mode', 'tools'] },
    { id: 'qwen/qwen3.8-27b', active: true, input_modalities: ['text'], output_modalities: ['text'], supported_features: ['json_mode'] },
    { id: 'openai/gpt-oss-safeguard-20b', active: true, input_modalities: ['text'], output_modalities: ['text'], supported_features: ['json_mode'] },
    { id: 'whisper-large-v3', active: true, input_modalities: ['audio'], output_modalities: ['text'], supported_features: [] },
    { id: 'canopylabs/orpheus-v1-english', active: true, input_modalities: ['text'], output_modalities: ['audio'], supported_features: [] },
    { id: 'meta-llama/llama-prompt-guard-2-86m', active: true, input_modalities: ['text'], output_modalities: ['text'], supported_features: [] },
    { id: 'old/model', active: false, input_modalities: ['text'], output_modalities: ['text'], supported_features: ['json_mode'] },
    { id: 'no-json/model', active: true, input_modalities: ['text'], output_modalities: ['text'], supported_features: ['tools'] },
    { name: 'no id' },
  ] };

  it('keeps active text models with JSON mode and drops guard, speech and retired ones', () => {
    expect(usableModels(list).map((m) => m.id)).toEqual(['openai/gpt-oss-20b', 'qwen/qwen3.8-27b']);
  });
  it('puts the recommended default first and labels it', () => {
    const [first] = usableModels({ data: [list.data[1], list.data[0]] });
    expect(first).toMatchObject({ id: DEFAULT_MODEL, recommended: true, name: 'GPT OSS 20B', contextWindow: 131072 });
  });
  it('copes with garbage', () => {
    for (const bad of [null, undefined, 'x', {}, { data: 'no' }]) expect(usableModels(bad)).toEqual([]);
  });
});

describe('checkKey', () => {
  it('maps the answers to a verdict', async () => {
    const answer = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await checkKey('k', answer(200, { data: [{ id: 'm', active: true, supported_features: ['json_mode'] }] }))).toMatchObject({ ok: true, models: [{ id: 'm' }] });
    expect(await checkKey('k', answer(401))).toEqual({ ok: false, reason: 'rejected' });
    expect(await checkKey('k', answer(500))).toEqual({ ok: false, reason: 'unavailable' });
    expect(await checkKey('k', (async () => { throw new TypeError('x'); }) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'network' });
  });
});

describe('looksLikeGroqKey', () => {
  it('accepts the gsk_ shape only', () => {
    expect(looksLikeGroqKey('gsk_' + 'a'.repeat(52))).toBe(true);
    expect(looksLikeGroqKey('  gsk_' + 'A1'.repeat(15) + '  ')).toBe(true);
    for (const bad of ['', 'sk-123', 'gsk_short', 'gsk_' + 'a'.repeat(20) + '!!']) expect(looksLikeGroqKey(bad), bad).toBe(false);
  });
});
