import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { analyticsConfigured, browserOptedOut, clearAnalyticsCookies, setAnalyticsEnabled } from '@/lib/analytics';
import { awaitingConsent, useConsentVersion } from '@/lib/consent';
import { Button } from '@/components/ui/button';

export const PRIVACY_URL = 'https://github.com/isttiiak/CineTrack/blob/main/PRIVACY.md';

/**
 * Opt-in prompt for visitors in the EU/EEA, UK and Switzerland (see lib/consent.ts). Shown only
 * when this deployment collects statistics at all, the browser isn't already refusing them
 * (Do Not Track / Global Privacy Control) and the visitor hasn't answered. Both answers are
 * equally easy, and either one is changeable later in Settings → Privacy.
 */
export function ConsentBanner() {
  useConsentVersion();
  const visible = analyticsConfigured && !browserOptedOut() && awaitingConsent();
  // Until the visitor agrees, no analytics identifier may sit in their browser (e.g. one set
  // before this prompt existed).
  useEffect(() => { if (visible) clearAnalyticsCookies(); }, [visible]);
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
      role="region" aria-labelledby="consent-title"
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-2xl rounded-2xl border p-4 shadow-2xl sm:p-5"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex gap-3">
        <BarChart3 className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: 'var(--accent-text)' }} />
        <div className="min-w-0">
          <h2 id="consent-title" className="text-sm font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>
            Help improve CineTrack?
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            With your OK, CineTrack uses Google Analytics to count which features get used. It stores a random
            identifier in your browser. It never includes your titles, notes or links, and the app works the same
            either way. You can change this any time in Settings → Privacy.{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--text-primary)]">Privacy note</a>
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="h-9 flex-1 sm:flex-none sm:px-6" onClick={() => setAnalyticsEnabled(false)}>No thanks</Button>
            <Button className="h-9 flex-1 sm:flex-none sm:px-6" onClick={() => setAnalyticsEnabled(true)}>Allow</Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
