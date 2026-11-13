import { describe, expect, it } from 'vitest';
import { candidatesFrom, mergeCandidates, parseCsv, detectKind } from './csvImport';
import { parseTitleLink, sharedTextFrom } from './links';
import { buildIcs } from './ics';
import { episodesLeft, isCaughtUp, nextEpisode, prevEpisode, statusAfterProgress } from './progress';
import { bestMatch, platformOf, suggestPlatform } from './titleData';
import { upcomingFor } from '../hooks/useUpcoming';
import type { MovieEntry } from '../types';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas, newlines and a BOM', () => {
    const csv = '﻿Name,Year\r\n"Crouching Tiger, Hidden Dragon",2000\n"The ""Best"" Film",2020\n"Two\nLines",1999\n';
    expect(parseCsv(csv)).toEqual([
      ['Name', 'Year'],
      ['Crouching Tiger, Hidden Dragon', '2000'],
      ['The "Best" Film', '2020'],
      ['Two\nLines', '1999'],
    ]);
  });
});

describe('export detection and candidates', () => {
  it('reads a Letterboxd diary with 5-star ratings and watch dates', () => {
    const rows = parseCsv('Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2024-03-02,Dune: Part Two,2024,https://boxd.it/a,4.5,,,2024-03-01\n');
    const { kind, candidates } = candidatesFrom(rows, 'diary.csv');
    expect(kind).toBe('letterboxd-diary');
    expect(candidates[0]).toMatchObject({ title: 'Dune: Part Two', year: '2024', status: 'watched', rating: 9, watchedOn: '2024-03-01', type: 'Film' });
  });

  it('treats a Letterboxd watchlist as planned', () => {
    const rows = parseCsv('Date,Name,Year,Letterboxd URI\n2024-01-01,Perfect Days,2023,https://boxd.it/b\n');
    expect(candidatesFrom(rows, 'watchlist.csv').candidates[0].status).toBe('plan');
  });

  it('reads IMDb ratings with ids, types and 10-point ratings', () => {
    const rows = parseCsv('Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating\ntt0903747,10,2023-05-01,Breaking Bad,Breaking Bad,https://www.imdb.com/title/tt0903747/,TV Series,9.5\ntt1375666,9,2022-01-01,Inception,Inception,,Movie,8.8\n');
    const { kind, candidates } = candidatesFrom(rows, 'ratings.csv');
    expect(kind).toBe('imdb');
    expect(candidates[0]).toMatchObject({ imdbId: 'tt0903747', type: 'Series', rating: 10, status: 'watched' });
    expect(candidates[1]).toMatchObject({ imdbId: 'tt1375666', type: 'Film', rating: 9 });
  });

  it('detects files by header', () => {
    expect(detectKind(['Const', 'Title'])).toBe('imdb');
    expect(detectKind(['Title', 'Year'])).toBe('generic');
  });

  it('merges a Letterboxd export: watched beats watchlist, ratings and dates combine', () => {
    const watched = candidatesFrom(parseCsv('Date,Name,Year,Letterboxd URI\n2024-01-01,Past Lives,2023,u1\n'), 'watched.csv').candidates;
    const ratings = candidatesFrom(parseCsv('Date,Name,Year,Letterboxd URI,Rating\n2024-01-02,Past Lives,2023,u1,5\n'), 'ratings.csv').candidates;
    const watchlist = candidatesFrom(parseCsv('Date,Name,Year,Letterboxd URI\n2023-01-01,Past Lives,2023,u1\n2023-01-01,Aftersun,2022,u2\n'), 'watchlist.csv').candidates;
    const merged = mergeCandidates([watchlist, watched, ratings]);
    expect(merged).toHaveLength(2);
    expect(merged.find((c) => c.key === 'u1')).toMatchObject({ status: 'watched', rating: 10 });
    expect(merged.find((c) => c.key === 'u2')?.status).toBe('plan');
  });
});

describe('links', () => {
  it('recognises IMDb and TMDB links', () => {
    expect(parseTitleLink('https://www.imdb.com/title/tt1375666/?ref_=nv')).toEqual({ kind: 'imdb', id: 'tt1375666' });
    expect(parseTitleLink('https://m.imdb.com/fr/title/tt0903747')).toEqual({ kind: 'imdb', id: 'tt0903747' });
    expect(parseTitleLink('tt0816692')).toEqual({ kind: 'imdb', id: 'tt0816692' });
    expect(parseTitleLink('https://www.themoviedb.org/tv/1399-game-of-thrones')).toEqual({ kind: 'tmdb', type: 'tv', id: 1399 });
    expect(parseTitleLink('Inception')).toBeNull();
  });

  it('finds the link inside shared text', () => {
    expect(sharedTextFrom(new URLSearchParams({ title: 'Inception', text: 'Watch this https://www.imdb.com/title/tt1375666/ !' })))
      .toBe('https://www.imdb.com/title/tt1375666/');
    expect(sharedTextFrom(new URLSearchParams({ text: 'Past Lives' }))).toBe('Past Lives');
    expect(sharedTextFrom(new URLSearchParams())).toBeNull();
  });
});

describe('buildIcs', () => {
  it('writes all-day events with escaping and CRLF line endings', () => {
    const ics = buildIcs([{ uid: 'x1', date: '2026-12-31', title: 'Show, S2; premiere' }], new Date('2026-01-01T00:00:00Z'));
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101\r\n');
    expect(ics).toContain('SUMMARY:Show\\, S2\\; premiere');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
});

describe('episode progress', () => {
  const seasons = [{ season_number: 1, episode_count: 3 }, { season_number: 2, episode_count: 2 }];
  const lastAired = { air_date: '2026-01-01', season_number: 2, episode_number: 1 };

  it('steps through episodes and seasons', () => {
    expect(nextEpisode(seasons, null)).toEqual({ season: 1, episode: 1 });
    expect(nextEpisode(seasons, { season: 1, episode: 3 })).toEqual({ season: 2, episode: 1 });
    expect(nextEpisode(seasons, { season: 2, episode: 2 })).toBeNull();
    expect(prevEpisode(seasons, { season: 2, episode: 1 })).toEqual({ season: 1, episode: 3 });
    expect(prevEpisode(seasons, { season: 1, episode: 1 })).toBeNull();
  });

  it('counts aired episodes left and detects catching up', () => {
    expect(episodesLeft(seasons, null, lastAired)).toBe(4);
    expect(episodesLeft(seasons, { season: 1, episode: 2 }, lastAired)).toBe(2);
    expect(isCaughtUp({ season: 2, episode: 1 }, lastAired)).toBe(true);
  });

  it('derives status from progress', () => {
    expect(statusAfterProgress('plan', { season: 1, episode: 1 }, lastAired, 'Returning Series')).toBe('watching');
    expect(statusAfterProgress('watching', { season: 2, episode: 1 }, lastAired, 'Ended')).toBe('watched');
    expect(statusAfterProgress('watching', { season: 2, episode: 1 }, lastAired, 'Returning Series')).toBe('watching');
    expect(statusAfterProgress('watched', { season: 1, episode: 2 }, lastAired, 'Ended')).toBe('watching');
  });
});

describe('matching and providers', () => {
  it('prefers exact title + year, then ±1 year, and flags guesses', () => {
    const hits = [
      { id: 1, title: 'Dune', release_date: '1984-12-14' },
      { id: 2, title: 'Dune', release_date: '2021-09-15' },
      { id: 3, title: 'Dune: Part Two', release_date: '2024-02-27' },
    ];
    expect(bestMatch(hits, 'Dune', '2021')).toEqual({ hit: hits[1], confident: true });
    expect(bestMatch(hits, 'Dune', '2022')?.hit.id).toBe(2);
    expect(bestMatch(hits, 'Dune Messiah', '2026')?.confident).toBe(false);
  });

  it('maps provider names and prefers services the user has', () => {
    expect(platformOf('Amazon Prime Video')).toBe('Prime Video');
    expect(platformOf('Max')).toBe('HBO Max');
    expect(platformOf('Mubi')).toBeNull();
    const providers = { flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }, { provider_id: 337, provider_name: 'Disney Plus', logo_path: null }] };
    expect(suggestPlatform(providers, ['Disney+'])).toBe('Disney+');
    expect(suggestPlatform(providers, [])).toBe('Netflix');
    expect(suggestPlatform(undefined, [])).toBeNull();
  });
});

describe('upcomingFor', () => {
  const series: MovieEntry = { id: 's', title: 'Show', type: 'Series', section: 'TV Series', year: '2020', country: '', genre: '', imdbRating: '', imdbUrl: '', isCustom: true };
  const film: MovieEntry = { ...series, id: 'f', type: 'Film', title: 'Film' };
  const today = '2026-11-13';

  it('lists next episodes, premieres, recent episodes and TBA returns', () => {
    const items = upcomingFor(series, 'watching', {
      status: 'Returning Series',
      next_episode_to_air: { air_date: '2026-11-20', season_number: 3, episode_number: 1, name: 'Episode 1' },
      last_episode_to_air: { air_date: '2026-11-10', season_number: 2, episode_number: 8 },
    }, today);
    expect(items.map((i) => [i.kind, i.date])).toEqual([['premiere', '2026-11-20'], ['aired', '2026-11-10']]);
    expect(items[0].label).toBe('Season 3 premiere');

    expect(upcomingFor(series, 'plan', { status: 'Returning Series', next_episode_to_air: null }, today)[0].kind).toBe('tba');
  });

  it('lists future film releases only', () => {
    expect(upcomingFor(film, 'plan', { release_date: '2026-12-18' }, today)[0]).toMatchObject({ kind: 'release', date: '2026-12-18' });
    expect(upcomingFor(film, 'plan', { release_date: '2025-01-01' }, today)).toEqual([]);
  });
});

describe('candidatesFromText (paste a list)', () => {
  it('reads one title per line with bullets, years, types and links', async () => {
    const { candidatesFromText } = await import('./csvImport');
    const list = candidatesFromText([
      '1. Inception (2010)',
      '- Breaking Bad (series)',
      '• Past Lives 2023',
      'https://www.imdb.com/title/tt0816692/',
      'https://www.themoviedb.org/tv/1399-game-of-thrones',
      'Inception (2010)',
      '',
    ].join('\n'), 'watched');
    expect(list.map((c) => [c.title, c.year, c.type, c.imdbId, c.tmdbRef?.id, c.status])).toEqual([
      ['Inception', '2010', undefined, undefined, undefined, 'watched'],
      ['Breaking Bad', '', 'Series', undefined, undefined, 'watched'],
      ['Past Lives', '2023', undefined, undefined, undefined, 'watched'],
      ['', '', undefined, 'tt0816692', undefined, 'watched'],
      ['', '', 'Series', undefined, 1399, 'watched'],
    ]);
  });

  it('splits a single line on semicolons, or commas when it is clearly a list', async () => {
    const { candidatesFromText } = await import('./csvImport');
    expect(candidatesFromText('Dune; Heat; Alien').map((c) => c.title)).toEqual(['Dune', 'Heat', 'Alien']);
    expect(candidatesFromText('Dune, Heat, Alien, Up').map((c) => c.title)).toEqual(['Dune', 'Heat', 'Alien', 'Up']);
    expect(candidatesFromText('Crouching Tiger, Hidden Dragon').map((c) => c.title)).toEqual(['Crouching Tiger, Hidden Dragon']);
    expect(candidatesFromText('Blade Runner 2049').map((c) => [c.title, c.year])).toEqual([['Blade Runner 2049', '']]);
  });
});

describe('shared pages from other sites', () => {
  it('cleans page titles into a Discover search', async () => {
    const { cleanPageTitle, sharedTextFrom } = await import('./links');
    expect(cleanPageTitle('Dune: Part Two (2024) - IMDb')).toBe('Dune: Part Two year:2024');
    expect(cleanPageTitle('Spider-Man: No Way Home (2021) - IMDb')).toBe('Spider-Man: No Way Home year:2021');
    expect(cleanPageTitle('Watch Wednesday | Netflix Official Site')).toBe('Wednesday');
    expect(sharedTextFrom(new URLSearchParams({ url: 'https://letterboxd.com/film/past-lives/', title: 'Past Lives (2023) • Letterboxd' }))).toBe('past lives');
    expect(sharedTextFrom(new URLSearchParams({ url: 'https://www.netflix.com/title/81231974', title: 'Watch Wednesday | Netflix Official Site' }))).toBe('Wednesday');
  });
});
