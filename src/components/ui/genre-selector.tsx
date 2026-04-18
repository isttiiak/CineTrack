import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Plus, Check } from 'lucide-react';
import { GENRES } from '@/lib/utils';
import { getLocalStorage, setLocalStorage } from '@/hooks/useLocalStorage';

const LS_CUSTOM_GENRES_KEY = 'cinetrack_custom_genres';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

function parseGenres(v: string): string[] {
  return v.split(',').map((g) => g.trim()).filter(Boolean);
}

export function GenreSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [customGenres, setCustomGenres] = useState<string[]>(
    () => getLocalStorage<string[]>(LS_CUSTOM_GENRES_KEY) ?? []
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = parseGenres(value);
  const allGenres = [...GENRES, ...customGenres.filter((g) => !GENRES.includes(g as never))];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (genre: string) => {
    const next = selected.includes(genre)
      ? selected.filter((g) => g !== genre)
      : [...selected, genre];
    onChange(next.join(', '));
  };

  const remove = (genre: string) => {
    onChange(selected.filter((g) => g !== genre).join(', '));
  };

  const addCustom = () => {
    const g = customInput.trim();
    if (!g) return;
    if (!allGenres.includes(g)) {
      const next = [...customGenres, g];
      setCustomGenres(next);
      setLocalStorage(LS_CUSTOM_GENRES_KEY, next);
    }
    if (!selected.includes(g)) {
      onChange([...selected, g].join(', '));
    }
    setCustomInput('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-colors min-h-[36px]"
        style={{
          background: 'var(--bg-elevated)',
          borderColor: open ? 'var(--border-focus)' : 'var(--border-subtle)',
          color: selected.length ? 'var(--text-primary)' : 'var(--text-disabled)',
        }}
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selected.length === 0 && <span>Select genres…</span>}
          {selected.map((g) => (
            <span
              key={g}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium border"
              style={{
                background: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {g}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(g); }}
                className="hover:text-red-400 transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-muted)' }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border shadow-2xl overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          {/* Genre grid */}
          <div className="p-2 grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
            {allGenres.map((g) => {
              const checked = selected.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggle(g)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ color: checked ? 'var(--accent-purple)' : 'var(--text-secondary)' }}
                >
                  <div
                    className="flex-shrink-0 h-3.5 w-3.5 rounded border flex items-center justify-center"
                    style={{
                      borderColor: checked ? 'var(--accent-purple)' : 'var(--border-subtle)',
                      background: checked ? 'var(--accent-purple)' : 'transparent',
                    }}
                  >
                    {checked && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  {g}
                </button>
              );
            })}
          </div>

          {/* Custom genre input */}
          <div
            className="flex items-center gap-2 px-3 py-2 border-t"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              placeholder="Add custom genre…"
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={!customInput.trim()}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-40"
              style={{ background: 'var(--bg-hover)', color: 'var(--accent-purple)' }}
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
