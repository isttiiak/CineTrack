import { useEffect, useRef, useCallback } from 'react';

export function useCursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;
    const move = (e: MouseEvent) => {
      el.style.background = `radial-gradient(600px circle at ${e.clientX}px ${e.clientY}px,
        rgba(242,178,74,0.075) 0%,
        rgba(90,169,255,0.04) 30%,
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
