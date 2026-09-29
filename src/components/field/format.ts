import type { Lang } from '../../lib/i18n';

// Dates and numbers for the capture screens. Times are shown in IST (UTC+05:30) by explicit offset
// arithmetic, never the host zone (technical-plan §1): the instant is shifted by +330 minutes and then
// read as UTC.

const IST_MS = 330 * 60_000;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ist = (iso: string) => new Date(Date.parse(iso) + IST_MS);

function kn(iso: string, o: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('kn-IN', { ...o, timeZone: 'UTC' }).format(ist(iso));
}

/** "Sat 27 Sep" (row dates, Design.md §8 mockup). */
export function istShortDay(iso: string, lang: Lang = 'en'): string {
  if (lang === 'kn') return kn(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const d = ist(iso);
  return `${DAYS[d.getUTCDay()]!.slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!.slice(0, 3)}`;
}

/** "27 Sep" (the plot card's "last picked"). */
export function istDayMonth(iso: string, lang: Lang = 'en'): string {
  if (lang === 'kn') return kn(iso, { day: 'numeric', month: 'short' });
  const d = ist(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!.slice(0, 3)}`;
}

/** "Monday, 28 September" (the greeting). */
export function istLongDate(iso: string, lang: Lang = 'en'): string {
  if (lang === 'kn') return kn(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  const d = ist(iso);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "2026-09-28" in IST, for a <time datetime>. */
export const istIsoDate = (iso: string): string => ist(iso).toISOString().slice(0, 10);

/** The part of the day in IST: morning before 12:00, afternoon before 17:00, else evening. */
export function istPartOfDay(iso: string): 'morning' | 'afternoon' | 'evening' {
  const h = ist(iso).getUTCHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

/** kg as the capture screens show it: one decimal ("44.0"). */
export const kg1 = (kg: number): string => kg.toFixed(1);

/** Hectares with one decimal ("1.8"). */
export const ha1 = (ha: number): string => (Math.round(ha * 10) / 10).toFixed(1);
