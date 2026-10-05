// Display formats and input rules for agreements (Design.md §28.7 "Money", "Input formats", "Field
// checks"). ISOMORPHIC and pure: the forms check on submit in the browser and the server checks again
// with the same rules and the same words. Dates are IST by explicit offset arithmetic, never the host
// zone (technical-plan §1 Time).

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Indian digit grouping of a whole number string: "150000" → "1,50,000". */
function groupIndian(whole: string): string {
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
}

/** "₹1,50,000.00" for 15000000 paise. */
export function formatInr(paise: number | bigint): string {
  const p = BigInt(paise);
  const neg = p < BigInt(0);
  const abs = neg ? -p : p;
  const rupees = (abs / BigInt(100)).toString();
  const rest = (abs % BigInt(100)).toString().padStart(2, '0');
  return `${neg ? '-' : ''}₹${groupIndian(rupees)}.${rest}`;
}

/** "1,200.0" for 1200: kilograms always with one decimal and grouped (Design.md §28.7). */
export function formatKg1(kg: number): string {
  const tenths = Math.round(kg * 10);
  return `${groupIndian(String(Math.trunc(tenths / 10)))}.${Math.abs(tenths % 10)}`;
}

/** "31 Dec 2026" for an ISO time, in IST. */
export function istDate(iso: string): string {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "30 Sep 2026, 4:12 pm" for an ISO time, in IST. */
export function istDateTime12(iso: string): string {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  const h = d.getUTCHours();
  return `${istDate(iso)}, ${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "31 Dec 2026" for a "2026-12-31" date input value, or '' when it is not one. */
export function dmy(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

/** Today's date in IST as "YYYY-MM-DD". */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The deadline instant: the end of that day in IST (23:59:59.999 +05:30), as ISO-8601 UTC. */
export function deadlineIso(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS).toISOString();
}

// ── Field checks (Design.md §28.7): what to do, with an example; never "invalid", "wrong" or "error" ──

export const FIELD_MESSAGES = {
  kgNeeded: 'Enter the agreed quantity in kg, for example 600.0.',
  kgDigits: 'Enter a quantity above 0 kg in digits, for example 600.0.',
  kgDecimals: 'Use one decimal place at most, for example 600.5.',
  minGradeNeeded: 'Choose the lowest grade you accept.',
  amountNeeded: 'Enter the amount in mock INR, for example 150000.',
  amountDigits: 'Enter an amount above ₹0 in digits. Commas and paise are optional, for example 1,50,000.50.',
  amountPaise: 'Paise take two digits at most, for example 150000.50.',
  deadlineNeeded: 'Choose the last day for delivery.',
  deadlineFuture: 'Choose a date after today.',
  gradeNeeded: 'Choose one of the five grades.',
  fpoNeeded: 'Choose an FPO from the list.',
  cropNeeded: 'Choose a crop from the list.',
} as const;

export type FieldMessage = (typeof FIELD_MESSAGES)[keyof typeof FIELD_MESSAGES];

type Parsed<T> = { ok: true; value: T } | { ok: false; message: FieldMessage };
const bad = (message: FieldMessage) => ({ ok: false as const, message });

/** Largest amount accepted: ₹10,00,00,000.00 (keeps paise a safe integer with room; mock money). */
const MAX_PAISE = 10_000_000_000;
/** Largest quantity accepted: 1,00,000.0 kg. */
const MAX_KG_TENTHS = 1_000_000;

/** Amount as typed ("150000", "1,50,000", "150000.5") → integer paise. */
export function parseAmount(raw: string): Parsed<number> {
  const s = raw.trim();
  if (s === '') return bad(FIELD_MESSAGES.amountNeeded);
  const m = /^([\d,]+)(?:\.(\d+))?$/.exec(s);
  if (!m || !/\d/.test(m[1]!)) return bad(FIELD_MESSAGES.amountDigits);
  if (m[2] !== undefined && m[2].length > 2) return bad(FIELD_MESSAGES.amountPaise);
  const whole = m[1]!.replace(/,/g, '');
  if (whole.length > 12) return bad(FIELD_MESSAGES.amountDigits);
  const paise = Number(whole) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (!(paise > 0) || paise > MAX_PAISE) return bad(FIELD_MESSAGES.amountDigits);
  return { ok: true, value: paise };
}

/** "Reads as ₹1,50,000.00 (mock INR). No real money moves." — the amount hint, read back from the field. */
export function amountHint(raw: string): string {
  const p = parseAmount(raw);
  return p.ok ? `Reads as ${formatInr(p.value)} (mock INR). No real money moves.` : 'Mock INR for the demo. No real money moves.';
}

/** Quantity as typed ("600", "600.5") → kilograms (one decimal at most). */
export function parseKg(raw: string): Parsed<number> {
  const s = raw.trim();
  if (s === '') return bad(FIELD_MESSAGES.kgNeeded);
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return bad(FIELD_MESSAGES.kgDigits);
  if (m[2] !== undefined && m[2].length > 1) return bad(FIELD_MESSAGES.kgDecimals);
  if (m[1]!.length > 7) return bad(FIELD_MESSAGES.kgDigits);
  const tenths = Number(m[1]) * 10 + Number(m[2] ?? '0');
  if (!(tenths > 0) || tenths > MAX_KG_TENTHS) return bad(FIELD_MESSAGES.kgDigits);
  return { ok: true, value: tenths / 10 };
}

/** Grams for the contract from a one-decimal kg value (exact: tenths × 100). */
export const kgToGrams = (kg: number): bigint => BigInt(Math.round(kg * 10)) * BigInt(100);

/** A date input value strictly after today in IST. */
export function parseDeadline(raw: string, now: Date = new Date()): Parsed<string> {
  const s = raw.trim();
  if (s === '') return bad(FIELD_MESSAGES.deadlineNeeded);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !dmy(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`)) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) {
    return bad(FIELD_MESSAGES.deadlineNeeded);
  }
  if (s <= istToday(now)) return bad(FIELD_MESSAGES.deadlineFuture);
  return { ok: true, value: s };
}

/** "Open until 31 Dec 2026, end of the day (IST). …" — the deadline hint, read back from the field. */
export function deadlineHint(raw: string): string {
  const d = dmy(raw.trim());
  return d
    ? `Open until ${d}, end of the day (IST). If nothing has settled by then, you can take the money back.`
    : 'If nothing has settled by then, you can take the money back.';
}

/** The agreement id at the end of a path (`AG-` + 8 capitals or digits), else null: never echo other input. */
export function agreementIdFromPath(path: string | null): string | null {
  const last = path?.replace(/\/+$/, '').split('/').pop() ?? '';
  return /^AG-[0-9A-Z]{8}$/.test(last) ? last : null;
}
