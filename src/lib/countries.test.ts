import { describe, expect, it } from 'vitest';
import { canonicalCountry, countriesOf, countryOptions, hasCountry, matchesCountryText } from './countries';

const c = (country: string) => ({ country });

describe('countriesOf', () => {
  it('splits co-productions and folds spellings together', () => {
    expect(countriesOf(c('USA/Japan'))).toEqual(['USA', 'Japan']);
    expect(countriesOf(c('United States of America, UK'))).toEqual(['USA', 'UK']);
    expect(countriesOf(c('usa / U.S. / United States'))).toEqual(['USA']);
    expect(countriesOf(c('Republic of Korea'))).toEqual(['South Korea']);
    expect(countriesOf(c(''))).toEqual([]);
  });

  it('keeps unknown countries as written', () => {
    expect(countriesOf(c('Bangladesh'))).toEqual(['Bangladesh']);
    expect(canonicalCountry('  New   Zealand ')).toBe('New Zealand');
  });
});

describe('hasCountry / matchesCountryText', () => {
  it('filters by exact country, including one of several', () => {
    expect(hasCountry(c('USA/Japan'), 'Japan')).toBe(true);
    expect(hasCountry(c('USA/Japan'), 'United States')).toBe(true);
    expect(hasCountry(c('Russia'), 'USA')).toBe(false);   // not a substring match
  });

  it('is looser for typed search', () => {
    expect(matchesCountryText(c('South Korea'), 'korea')).toBe(true);
    expect(matchesCountryText(c('USA'), 'us')).toBe(true);
    expect(matchesCountryText(c('Russia'), 'us')).toBe(false);   // "us" is inside "russia" but is not the country
    expect(matchesCountryText(c('India'), 'ind')).toBe(true);
  });
});

describe('countryOptions', () => {
  it('counts each country once per title, most titles first', () => {
    const opts = countryOptions([c('USA'), c('United States'), c('USA/Japan'), c('Japan'), c('South Korea'), c('')]);
    expect(opts).toEqual([
      { name: 'USA', count: 3 },
      { name: 'Japan', count: 2 },
      { name: 'South Korea', count: 1 },
    ]);
  });
});
