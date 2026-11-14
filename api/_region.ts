/**
 * Tells the browser whether the visitor is in a region where analytics identifiers need opt-in
 * consent (EU/EEA, UK, Switzerland). Vercel puts the visitor's country, derived from the IP
 * address, in a request header, so nothing is stored or sent anywhere else, and the IP address
 * never reaches the app's code. Shared by the Vercel function (api/region.ts) and the Vite dev
 * server. (Files starting with "_" in api/ are not deployed as functions.)
 */

export const CONSENT_COUNTRIES: ReadonlySet<string> = new Set([
  // EU
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT',
  'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // rest of the EEA, the UK and Switzerland
  'IS', 'LI', 'NO', 'GB', 'CH',
]);

/** `consentRequired` is null when the country is unknown (local dev, some proxies). */
export function regionFor(countryHeader: string | null): { country: string | null; consentRequired: boolean | null } {
  const country = (countryHeader ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return { country: null, consentRequired: null };
  return { country, consentRequired: CONSENT_COUNTRIES.has(country) };
}

export function handleRegionRequest(request: Request): Response {
  if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { allow: 'GET', 'content-type': 'application/json' } });
  const body = regionFor(request.headers.get('x-vercel-ip-country'));
  // Per visitor: never cached by a shared cache.
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
}
