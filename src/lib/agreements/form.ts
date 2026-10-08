import { FIELD_MESSAGES, parseAmount, parseDeadline, parseKg, type FieldMessage } from './format';
import { parseGrade, type Grade } from './grades';

// The new-agreement and grade forms' checks (Design.md §28.7 "Field checks"). ISOMORPHIC: run on submit
// in the browser and again on the server with the same rules and words. Every value is kept as typed.

export type NewAgreementFields = { fpo: string; crop: string; kg: string; minGrade: string; amount: string; deadline: string };
export type NewAgreementField = keyof NewAgreementFields;
/** Field order: focus moves to the first field that needs a change. */
export const NEW_AGREEMENT_ORDER: NewAgreementField[] = ['fpo', 'crop', 'kg', 'minGrade', 'amount', 'deadline'];

export type NewAgreementValues = { fpoOrg: string; crop: 'arabica' | 'robusta'; agreedKg: number; minGrade: Grade; amountPaise: number; deadlineDate: string };

export type FormCheck<T, F extends string> = { ok: true; values: T } | { ok: false; errors: Partial<Record<F, FieldMessage>> };

export function checkNewAgreement(f: NewAgreementFields, fpoIds: readonly string[], now: Date = new Date()): FormCheck<NewAgreementValues, NewAgreementField> {
  const errors: Partial<Record<NewAgreementField, FieldMessage>> = {};
  if (!fpoIds.includes(f.fpo)) errors.fpo = FIELD_MESSAGES.fpoNeeded;
  if (f.crop !== 'arabica' && f.crop !== 'robusta') errors.crop = FIELD_MESSAGES.cropNeeded;
  const kg = parseKg(f.kg);
  if (!kg.ok) errors.kg = kg.message;
  const grade = parseGrade(f.minGrade);
  if (grade === null) errors.minGrade = FIELD_MESSAGES.minGradeNeeded;
  const amount = parseAmount(f.amount);
  if (!amount.ok) errors.amount = amount.message;
  const deadline = parseDeadline(f.deadline, now);
  if (!deadline.ok) errors.deadline = deadline.message;
  if (Object.keys(errors).length > 0 || !kg.ok || !amount.ok || !deadline.ok || grade === null) return { ok: false, errors };
  return { ok: true, values: { fpoOrg: f.fpo, crop: f.crop as 'arabica' | 'robusta', agreedKg: kg.value, minGrade: grade, amountPaise: amount.value, deadlineDate: deadline.value } };
}

export function checkGrade(raw: string): FormCheck<Grade, 'grade'> {
  const g = parseGrade(raw);
  return g === null ? { ok: false, errors: { grade: FIELD_MESSAGES.gradeNeeded } } : { ok: true, values: g };
}
