import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface Rule { source: string; headers: { key: string; value: string }[] }
const config = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../vercel.json'), 'utf8')) as {
  headers: Rule[]; rewrites: { source: string; destination: string }[];
};

const matching = (pathname: string) => config.headers.filter((r) => new RegExp(`^${r.source}$`).test(pathname));
const header = (r: Rule, key: string) => r.headers.find((h) => h.key === key)?.value ?? '';

describe('vercel.json headers', () => {
  it('gives each path exactly one set of security headers (no overlap to guess the precedence of)', () => {
    for (const p of ['/', '/index.html', '/assets/index-abc.js', '/manifest.json', '/sw.js', '/api/ai', '/__/auth/handler', '/__/auth/iframe', '/__/auth/handler.js']) {
      expect(matching(p), p).toHaveLength(1);
    }
  });

  it('keeps the app\'s pages unframable and script-strict', () => {
    for (const p of ['/', '/assets/index-abc.js', '/__/other']) {
      const [rule] = matching(p);
      const csp = header(rule, 'Content-Security-Policy');
      expect(header(rule, 'X-Frame-Options'), p).toBe('DENY');
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain('nonce-');
      expect(csp.match(/script-src[^;]*/)?.[0]).not.toContain('unsafe-inline');
    }
  });

  it('lets only the sign-in helper pages be framed by the app itself, with Google\'s fixed nonce, never unsafe-inline', () => {
    for (const p of ['/__/auth/handler', '/__/auth/iframe', '/__/auth/links']) {
      const [rule] = matching(p);
      const csp = header(rule, 'Content-Security-Policy');
      expect(header(rule, 'X-Frame-Options'), p).toBe('SAMEORIGIN');
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).toContain("'nonce-firebase-auth-helper'");
      expect(csp.match(/script-src[^;]*/)?.[0]).not.toContain('unsafe-inline');
      expect(csp).toContain("object-src 'none'");
      expect(header(rule, 'X-Content-Type-Options')).toBe('nosniff');
    }
  });
});

describe('vercel.json rewrites', () => {
  it('proxies the sign-in helper to Firebase transparently (a rewrite, which Vercel serves as a proxy, not a redirect)', () => {
    const r = config.rewrites.find((x) => x.source === '/__/auth/:path*');
    expect(r?.destination).toMatch(/^https:\/\/[a-z0-9-]+\.firebaseapp\.com\/__\/auth\/:path\*$/);
  });
  it('rewrites nothing else', () => {
    expect(config.rewrites).toHaveLength(1);
  });
});
