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

/** True once the element has been on screen (stays true). */
export function useSeen<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}
