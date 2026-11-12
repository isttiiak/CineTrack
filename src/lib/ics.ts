export interface CalendarEvent {
  uid: string;          // stable per event, so re-imports update instead of duplicating
  date: string;         // YYYY-MM-DD (all-day event)
  title: string;
  description?: string;
  url?: string;
}

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 characters are folded (continuation lines start with a space), per RFC 5545. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) { out.push(rest.slice(0, 75)); rest = ' ' + rest.slice(75); }
  out.push(rest);
  return out.join('\r\n');
}

const compactDate = (d: string) => d.replace(/-/g, '');
function nextDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, day + 1));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** An iCalendar file of all-day events (Google Calendar, Apple Calendar and Outlook all import it). */
export function buildIcs(events: CalendarEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CineTrack//Upcoming//EN', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:CineTrack upcoming',
  ];
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@cinetrack`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${escapeText(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
