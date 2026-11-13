import { highlightParts, type ParsedQuery } from '@/lib/search';

/** Renders text with the search words marked (accent- and case-insensitive). */
export function HighlightText({ text, query }: { text: string; query: ParsedQuery | null }) {
  if (!query) return <>{text}</>;
  return (
    <>
      {highlightParts(text, query).map((p, i) => p.hit
        ? <mark key={i} className="rounded-sm bg-brand/25 px-px text-inherit">{p.text}</mark>
        : <span key={i}>{p.text}</span>)}
    </>
  );
}
