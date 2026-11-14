import { describe, expect, it } from 'vitest';
import { timeZoneSuggestsConsentRegion } from './consent';

describe('timeZoneSuggestsConsentRegion', () => {
  it('flags European zones', () => {
    for (const tz of ['Europe/London', 'Europe/Berlin', 'Europe/Dublin', 'Atlantic/Canary']) expect(timeZoneSuggestsConsentRegion(tz), tz).toBe(true);
  });
  it('does not flag the rest of the world or an empty zone', () => {
    for (const tz of ['America/New_York', 'Asia/Dhaka', 'Australia/Sydney', 'Africa/Cairo', 'Atlantic/Bermuda', '']) expect(timeZoneSuggestsConsentRegion(tz), tz).toBe(false);
  });
});
