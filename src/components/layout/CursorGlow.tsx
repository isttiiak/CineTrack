import { useCursorGlow } from '@/hooks/useCursorGlow';

export function CursorGlow() {
  const { glowRef } = useCursorGlow();
  return (
    <div
      ref={glowRef}
      className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
      style={{ opacity: 1 }}
    />
  );
}
