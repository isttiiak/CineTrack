import { useEffect, useRef, useState } from 'react';
import { getRatings, type Ratings, type TmdbKind } from '@/lib/titleData';

/** Loads ratings for a title once `enabled` (e.g. when the card scrolls into view). */
export function useRatings(kind: TmdbKind, id: number | null | undefined, enabled = true) {
  const [ratings, setRatings] = useState<Ratings | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled || !id) return;
    let active = true;
    setLoading(true);
    getRatings(kind, id).then((r) => { if (active) { setRatings(r); setLoading(false); } });
    return () => { active = false; };
  }, [kind, id, enabled]);
  return { ratings, loading };
}

/**
 * True once the element has been on screen (stays true). With `dwellMs`, it must stay in view that long:
 * flicking through a long list then doesn't fire a ratings request for every card that flew past
 * (ratings come from a keyed API with a daily quota).
 */
export function useSeen<T extends Element>(dwellMs = 0) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (timer) { clearTimeout(timer); timer = undefined; }
      if (!e.isIntersecting) return;
      if (dwellMs <= 0) { setSeen(true); io.disconnect(); return; }
      timer = setTimeout(() => { setSeen(true); io.disconnect(); }, dwellMs);
    }, { rootMargin: dwellMs > 0 ? '0px' : '200px' });
    io.observe(el);
    return () => { if (timer) clearTimeout(timer); io.disconnect(); };
  }, [seen, dwellMs]);
  return { ref, seen };
}
