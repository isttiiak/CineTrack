import { useState, useEffect } from 'react';
import { Film } from 'lucide-react';
import { useTMDB } from '@/hooks/useTMDB';
import type { MediaType } from '@/types';

interface Props {
  title: string;
  year: string;
  type: MediaType;
  posterUrl?: string;
  onPosterLoaded: (url: string) => void;
}

export function PosterThumb({ title, year, type, posterUrl, onPosterLoaded }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [src, setSrc] = useState(posterUrl ?? '');
  const { fetchPoster } = useTMDB();

  useEffect(() => {
    if (posterUrl) { setSrc(posterUrl); return; }
    fetchPoster(title, year, type).then((url) => {
      if (url) { setSrc(url); onPosterLoaded(url); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, year, type, posterUrl]);

  if (!src) {
    return (
      <div className="flex h-[69px] w-[46px] flex-shrink-0 items-center justify-center rounded bg-[var(--bg-elevated)]">
        <Film className="h-5 w-5 text-[var(--text-disabled)]" />
      </div>
    );
  }

  return (
    <div className="relative h-[69px] w-[46px] flex-shrink-0 overflow-hidden rounded">
      {!loaded && (
        <div className="absolute inset-0 bg-[var(--bg-elevated)] animate-pulse rounded" />
      )}
      <img
        src={src}
        alt={title}
        className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setSrc('')}
      />
    </div>
  );
}
