import { istDay } from '../certificate/copy';
import { istClock } from '../review/copy';
import { bandFor, isPlaceholderBand, PROCESSES, type MbCrop, type Process } from './config';
import type { ProcessorBatch } from './read';

// The processor surface's words (Design.md §28.6, §28.7; contract.html screen 6). English only, like the
// admin surfaces (TP18). Plain words; never accusation words: a step is "Within range" or "Flagged".

export const PROCESS_LABEL: Record<Process, string> = {
  pulping: 'Pulping',
  drying: 'Drying',
  hulling_parchment: 'Hulling parchment',
  hulling_dry_cherry: 'Hulling dry cherry',
};

/** The past-tense word for a recorded step ("Hulled"), as the certificate journey says it. */
export const PROCESS_DONE: Record<Process, string> = { pulping: 'Pulped', drying: 'Dried', hulling_parchment: 'Hulled', hulling_dry_cherry: 'Hulled' };

const CROP: Record<MbCrop, string> = { arabica: 'Arabica', robusta: 'Robusta' };
export const cropName = (c: MbCrop): string => CROP[c];

const pct = (n: number): string => String(n);
export const kg1 = (kg: number): string => kg.toFixed(1);

/** The hint under each process option: the band for this batch's crop, or that it is a placeholder. */
export function processHint(p: Process, crop: MbCrop): string {
  if (p === 'pulping') return 'Fresh cherry to wet parchment · placeholder range, to be confirmed';
  if (p === 'drying') return 'Placeholder range, to be confirmed';
  const [min, max] = bandFor(p, crop);
  return `Expected output ${pct(min)}–${pct(max)}% of input (${CROP[crop]})`;
}

/** The band line under the weights, for the chosen process (or before one is chosen). */
export function bandLine(p: Process | null, crop: MbCrop): string {
  if (!p) return 'Each process has an expected range of output to input. Outside it the step is flagged, not refused.';
  const [min, max] = bandFor(p, crop);
  const name = PROCESS_LABEL[p].toLowerCase();
  if (isPlaceholderBand(p)) return `For ${name} (${CROP[crop]}), the range ${pct(min)}–${pct(max)}% of input is a placeholder, to be confirmed. Outside it the step is flagged, not refused.`;
  return `For ${name} (${CROP[crop]}), output is usually ${pct(min)}–${pct(max)}% of input. Outside that range the step is flagged, not refused.`;
}

export const PROCESS_OPTIONS = PROCESSES;

/** "1 Oct 2026, 10:05 am" in IST. */
export const istWhen = (iso: string): string => `${istDay(iso)}, ${istClock(iso)}`;
/** "30 Sep" in IST. */
export const istShort = (iso: string): string => istDay(iso).replace(/ \d{4}$/, '');

export type RowStatus = { cls: 'ok' | 'check' | 'na'; text: string };

/** A list row's status line (§28.7 "Statuses and their marks"). */
export function rowStatus(b: ProcessorBatch): RowStatus {
  if (b.handedOn) return { cls: 'ok', text: `Handed on to ${b.handedOn.toOrgName}` };
  if (!b.step) return { cls: 'na', text: 'Ready for a processing step' };
  const done = PROCESS_DONE[b.step.process];
  return b.step.status === 'ok' ? { cls: 'ok', text: `${done} · within the expected range` } : { cls: 'check', text: `${done} · flagged: ${b.step.ratio.toFixed(1)}% of input` };
}

/** The detail's chip. */
export function detailChip(b: ProcessorBatch): RowStatus {
  if (b.handedOn) return { cls: 'ok', text: 'Handed on' };
  if (!b.step) return { cls: 'na', text: 'With you' };
  return b.step.status === 'ok' ? { cls: 'ok', text: 'Within range' } : { cls: 'check', text: 'Flagged' };
}

export const COPY = {
  title: 'Batches with you',
  sub: 'Record what you did to each batch, then hand it on to the buyer.',
  loading: 'Loading your batches…',
  emptyH: 'No batches with you right now.',
  emptyP: 'A batch appears here when an FPO hands it to you.',
  errorH: 'Couldn’t load your batches.',
  errorP: 'Nothing was changed.',
  retry: 'Try again',
  back: 'Back to batches',
  pick: 'Choose a batch to record its processing step and hand it on.',
  railLabel: 'Processor sections',
  roleLabel: (org: string) => org,
  recordH: 'Record a processing step',
  processLegend: 'Process',
  inputLabel: 'Input (kg)',
  inputHint: 'What you weighed going in.',
  outputLabel: 'Output (kg)',
  outputHint: 'What you weighed coming out. More than the input is allowed; the step is then flagged.',
  signedNote: 'Signed by the server on behalf of your account and recorded permanently.',
  record: 'Sign and record step',
  recording: 'Recording the step…',
  recordErrB: 'Couldn’t record the step.',
  recordErrP: 'Nothing was signed or saved. What you entered is still here.',
  weightName: 'Weight in and out',
  nothingRefused: 'Nothing is refused. The step is recorded, and the flag shows on the batch’s certificate.',
  handH: 'Hand on to a buyer',
  buyerLabel: 'Buyer',
  chooseBuyer: 'Choose a buyer',
  handNote: 'Signed by the server on behalf of your account. After this, the batch is no longer with you.',
  handOn: 'Sign and hand on',
  handingOn: (buyer: string) => `Handing on to ${buyer}…`,
  handErrB: 'Couldn’t hand on the batch.',
  handErrP: 'Nothing was signed. The batch is still with you.',
  recorded: 'Recorded',
  handedMeta: (by: string, org: string, when: string) => `Signed on behalf of ${by} (${org}) on ${when}. This batch is no longer with you.`,
  noBuyers: 'No buyer organisations are set up yet.',
  signOut: 'Sign out',
} as const;
