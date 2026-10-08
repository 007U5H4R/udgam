// The quality grade scale (Design.md §28.3, D9). ISOMORPHIC: the buyer's forms use it too. The buyer
// picks a label; the app stores and signs the number; ContractFarming keeps it as a uint8 and compares
// grade ≥ minGrade. The server refuses any other number (a uint8 would allow 255).

export const GRADES = [
  { label: 'Excellent', value: 90 },
  { label: 'Very good', value: 80 },
  { label: 'Good', value: 70 },
  { label: 'Fair', value: 60 },
  { label: 'Low', value: 40 },
] as const;

export type Grade = (typeof GRADES)[number]['value'];

const BY_VALUE = new Map<number, string>(GRADES.map((g) => [g.value, g.label]));

/** Whether `v` is exactly one of the five grade numbers (rejects 255, 100, 85, '80', NaN…). */
export function isGrade(v: unknown): v is Grade {
  return typeof v === 'number' && BY_VALUE.has(v);
}

/** A form value ("80") as a grade, or null. */
export function parseGrade(raw: unknown): Grade | null {
  if (typeof raw !== 'string' || !/^\d{2}$/.test(raw)) return null;
  const n = Number(raw);
  return isGrade(n) ? n : null;
}

/** "Very good" for 80. */
export function gradeLabel(g: Grade): string {
  return BY_VALUE.get(g)!;
}

/** "Very good · 80" — how a grade is always displayed (Design.md §28.3). */
export function gradeDisplay(g: Grade): string {
  return `${gradeLabel(g)} · ${g}`;
}
