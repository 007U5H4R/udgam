// Display helpers for the batch screens. Times show in IST by explicit offset arithmetic, never the
// host zone (technical-plan §1 Time). Pure: the builder uses them in the browser too.

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

/** "30 Sep 2026, 14:05 IST" for an ISO-8601 UTC time. */
export function istDateTime(iso: string): string {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} IST`;
}

/** Kilograms: whole numbers bare, otherwise one decimal (captures are multiples of 0.5 kg). */
export const formatKg = (kg: number): string => (Number.isInteger(kg) ? String(kg) : kg.toFixed(1));

/** A 0–100 score: whole numbers bare, otherwise one decimal. */
export const formatScore = (score: number): string => (Number.isInteger(score) ? String(score) : (Math.round(score * 10) / 10).toFixed(1));
