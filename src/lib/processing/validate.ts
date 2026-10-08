import { isProcess, type Process } from './config';
import { t } from '../i18n';

// Field checks for the processing step and the hand-on (Design.md §28.7 "Field checks"; WCAG 2.2 SC
// 3.3.1/3.3.3). Isomorphic: the processor's form checks on submit with these rules and words, and the
// server checks again with the same ones. Messages say what to do, with an example; they never say
// invalid, wrong, error or not allowed. Output above input is ACCEPTED here (flagged later as a gain in
// weight, EVAL-102), never refused.

export type StepField = 'process' | 'inputKg' | 'outputKg';
export type StepFieldErrors = Partial<Record<StepField, string>>;

export const FIELD_MESSAGES = {
  process: t('processor.field.process'),
  inputNeeded: t('processor.field.inputNeeded'),
  inputFormat: t('processor.field.inputFormat'),
  outputNeeded: t('processor.field.outputNeeded'),
  outputFormat: t('processor.field.outputFormat'),
  buyer: t('processor.field.buyer'),
} as const;

/** Digits with at most one decimal place, up to 99,999.9 kg (kg are shown to one decimal across M-001). */
const KG = /^\d{1,5}(\.\d)?$/;

/** A kg field as typed → kilograms, or null when it does not read as a weight above 0. */
export function parseKg(raw: string): number | null {
  const s = raw.trim();
  if (!KG.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type StepInput = { process: Process; inputKg: number; outputKg: number };

/** Check the three fields of "Record a processing step" as typed. */
export function checkStepFields(raw: { process: string; inputKg: string; outputKg: string }): { ok: true; value: StepInput } | { ok: false; errors: StepFieldErrors } {
  const errors: StepFieldErrors = {};
  if (!isProcess(raw.process)) errors.process = FIELD_MESSAGES.process;
  const inputKg = parseKg(raw.inputKg);
  if (raw.inputKg.trim() === '') errors.inputKg = FIELD_MESSAGES.inputNeeded;
  else if (inputKg === null) errors.inputKg = FIELD_MESSAGES.inputFormat;
  const outputKg = parseKg(raw.outputKg);
  if (raw.outputKg.trim() === '') errors.outputKg = FIELD_MESSAGES.outputNeeded;
  else if (outputKg === null) errors.outputKg = FIELD_MESSAGES.outputFormat;
  if (Object.keys(errors).length > 0 || inputKg === null || outputKg === null || !isProcess(raw.process)) return { ok: false, errors };
  return { ok: true, value: { process: raw.process, inputKg, outputKg } };
}
