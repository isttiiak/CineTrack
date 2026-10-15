import { useState, useEffect } from 'react';
import { Film } from 'lucide-react';
import { useTMDB, posterAt } from '@/hooks/useTMDB';
import { safeUrl } from '@/lib/schema';
import { cn } from '@/lib/utils';
import type { MediaType } from '@/types';

interface Props {
  title: string;
  year: string;
  type: MediaType;
  posterUrl?: string;
  onPosterLoaded?: (url: string) => void;
  size?: 'w92' | 'w185' | 'w342' | 'w500';
  className?: string;
}

export function PosterThumb({ title, year, type, posterUrl, onPosterLoaded, size = 'w185', className }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fetched, setFetched] = useState('');
  const { fetchPoster } = useTMDB();

  useEffect(() => {
    setFailed(false);
    if (posterUrl) return;
    let active = true;
    fetchPoster(title, year, type).then((url) => {
      if (!active || !url) return;
      setFetched(url);
      onPosterLoaded?.(url);
    });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, year, type, posterUrl]);

  const src = failed ? '' : safeUrl(posterAt(posterUrl || fetched, size));

  return (
    <div className={cn('relative flex-shrink-0 overflow-hidden rounded-md bg-[var(--bg-elevated)]', className)}>
      {src ? (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-[var(--bg-elevated)]" />}
          <img
            src={src}
            alt={title}
            loading="lazy"
            className={cn('h-full w-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Film className="h-1/3 w-1/3 max-h-8 max-w-8 text-[var(--text-disabled)]" />
        </div>
      )}
    </div>
  );
}
