import { useState } from 'react';

interface Props {
  rating?: number;
  onChange: (rating: number | undefined) => void;
}

export function RatingBadge({ rating, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={1}
        max={10}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft);
          if (!isNaN(n) && n >= 1 && n <= 10) onChange(Math.round(n * 10) / 10);
          else if (draft === '') onChange(undefined);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setEditing(false); }
        }}
        className="w-14 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        placeholder="1-10"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(rating?.toString() ?? ''); setEditing(true); }}
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono transition-colors hover:bg-[var(--bg-hover)]"
      style={{ color: rating ? 'var(--accent-cyan)' : 'var(--text-disabled)' }}
      title="Click to set your rating"
    >
      {rating ? `${rating}/10` : '—/10'}
    </button>
  );
}
