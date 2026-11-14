import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_MESSAGES, AiSearchError, executePlan, fetchPlan, type AiResult } from '@/lib/aiSearch';
import { track } from '@/lib/analytics';

export type AiStatus = 'idle' | 'loading' | 'done' | 'error';

export interface AiState {
  status: AiStatus;
  result?: AiResult;
  summary?: string;
  message?: string;        // why it failed, or why nothing came back
  retryable?: boolean;
}

/**
 * "Ask AI" for the Discover search box: nothing is sent until `ask()` is called (never while typing).
 * A new query resets the answer; the remaining daily allowance survives it.
 */
export function useAiSearch(query: string) {
  const [state, setState] = useState<AiState>({ status: 'idle' });
  const [quota, setQuota] = useState<{ remaining: number; limit: number } | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    controller.current?.abort();
    setState({ status: 'idle' });
  }, [query]);
  useEffect(() => () => controller.current?.abort(), []);

  const ask = useCallback(async () => {
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setState({ status: 'loading' });
    try {
      const { plan, remaining, limit } = await fetchPlan(query.trim(), ctl.signal);
      if (remaining !== null && limit !== null) setQuota({ remaining, limit });
      if (!plan) {
        track('ai_search', { ok: 0 });
        setState({ status: 'done', result: { items: [], chips: [], notes: [] }, message: 'AI could not turn that into a search. Try mentioning a genre, years, a country, a person or a title you like.' });
        return;
      }
      const result = await executePlan(plan, ctl.signal);
      track('ai_search', { ok: result.items.length ? 1 : 0 });
      setState({ status: 'done', result, summary: plan.summary });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const code = err instanceof AiSearchError ? err.code : 'unavailable';
      if (code === 'limit') setQuota((q) => ({ remaining: 0, limit: q?.limit ?? 0 }));
      setState({ status: 'error', message: AI_MESSAGES[code], retryable: code === 'busy' || code === 'unavailable' || code === 'slow_down' });
    }
  }, [query]);

  return { ...state, quota, ask };
}
