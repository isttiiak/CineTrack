import { useEffect, useRef, useCallback } from 'react';

export function useCursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;
    const move = (e: MouseEvent) => {
      el.style.background = `radial-gradient(600px circle at ${e.clientX}px ${e.clientY}px,
        rgba(99,102,241,0.10) 0%,
        rgba(59,130,246,0.05) 30%,
        transparent 70%)`;
    };
    window.addEventListener('mousemove', move, { passive: true });
    return () => window.removeEventListener('mousemove', move);
  }, []);

  const pulse = useCallback(() => {
    const el = glowRef.current;
    if (!el) return;
    el.classList.remove('glow-pulse');
    void el.offsetWidth; // reflow
    el.classList.add('glow-pulse');
    setTimeout(() => el.classList.remove('glow-pulse'), 600);
  }, []);

  return { glowRef, pulse };
}
