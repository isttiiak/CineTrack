import { ExternalLink } from 'lucide-react';
import { platformOf, type ProviderInfo, type RegionProviders } from '@/lib/titleData';
import { cn } from '@/lib/utils';

const LOGO = 'https://image.tmdb.org/t/p/w92';

const regionName = (code: string) => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; } catch { return code; }
};

function Logos({ list, myServices }: { list: ProviderInfo[]; myServices: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((p) => {
        const mine = myServices.includes(platformOf(p.provider_name) ?? '');
        return (
          <span key={p.provider_id} title={`${p.provider_name}${mine ? ' · you have this' : ''}`} className="relative">
            {p.logo_path
              ? <img src={`${LOGO}${p.logo_path}`} alt={p.provider_name} loading="lazy"
                     className={cn('h-8 w-8 rounded-lg object-cover', mine && 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-[var(--bg-surface)]')} />
              : <span className="flex h-8 items-center rounded-lg px-2 text-[10px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>{p.provider_name}</span>}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Streaming / rent / buy options in the user's region. Data comes from JustWatch via TMDB,
 * which requires crediting JustWatch wherever it's shown.
 */
export function WhereToWatch({ providers, region, myServices, loading, className }: {
  providers: RegionProviders | undefined; region: string; myServices: string[]; loading?: boolean; className?: string;
}) {
  if (loading) return <div className={cn('h-8 w-40 animate-pulse rounded-lg', className)} style={{ background: 'var(--bg-elevated)' }} />;

  const dedupe = (list: ProviderInfo[]) => list.filter((p, i) => list.findIndex((q) => q.provider_id === p.provider_id) === i);
  const stream = dedupe([...(providers?.flatrate ?? []), ...(providers?.free ?? []), ...(providers?.ads ?? [])]);
  const rentBuy = dedupe([...(providers?.rent ?? []), ...(providers?.buy ?? [])]).filter((p) => !stream.some((s) => s.provider_id === p.provider_id));
  const label = (t: string) => <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{t}</p>;

  return (
    <div className={className}>
      {stream.length === 0 && rentBuy.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Not available to stream, rent or buy in {regionName(region)} right now.</p>
      ) : (
        <div className="grid gap-2.5">
          {stream.length > 0 && <div>{label('Stream')}<Logos list={stream} myServices={myServices} /></div>}
          {rentBuy.length > 0 && <div>{label('Rent or buy')}<Logos list={rentBuy.slice(0, 8)} myServices={myServices} /></div>}
        </div>
      )}
      <p className="mt-2 flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-disabled)' }}>
        {regionName(region)} · Data by JustWatch
        {providers?.link && (
          <a href={providers.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:underline" style={{ color: 'var(--text-muted)' }}>
            · all options <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </p>
    </div>
  );
}
