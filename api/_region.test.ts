import { describe, expect, it } from 'vitest';
import { handleRegionRequest, regionFor } from './_region';

describe('regionFor', () => {
  it('requires consent in the EU, EEA, UK and Switzerland', () => {
    for (const c of ['DE', 'FR', 'IE', 'NO', 'IS', 'GB', 'CH']) expect(regionFor(c).consentRequired, c).toBe(true);
  });
  it('does not require it elsewhere', () => {
    for (const c of ['US', 'BD', 'IN', 'CA', 'AU']) expect(regionFor(c).consentRequired, c).toBe(false);
  });
  it('is case- and whitespace-insensitive', () => {
    expect(regionFor(' de ')).toEqual({ country: 'DE', consentRequired: true });
  });
  it('reports unknown rather than guessing', () => {
    for (const v of [null, '', 'XXX', '1', 'D']) expect(regionFor(v)).toEqual({ country: null, consentRequired: null });
  });
});

describe('handleRegionRequest', () => {
  const call = (headers: Record<string, string>, method = 'GET') =>
    handleRegionRequest(new Request('http://localhost/api/region', { method, headers }));

  it('reads the Vercel country header and is never cached', async () => {
    const res = call({ 'x-vercel-ip-country': 'FR' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.json()).toEqual({ country: 'FR', consentRequired: true });
  });
  it('rejects other methods', () => {
    expect(call({}, 'POST').status).toBe(405);
  });
});
