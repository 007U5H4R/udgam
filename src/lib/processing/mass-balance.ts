import { bandFor, isPlaceholderBand, type Band, type MbCrop, type Process } from './config';

// The mass-balance rule (technical-plan TSK-26.2, F18, EVAL-100–102). Pure. A processing step's output as
// a percentage of its input, to one decimal, is compared with the band of `mb-1` for the process and
// crop, inclusive at both edges. The ratio that is compared is the one the sentence shows, so what the
// sentence says is what was judged. Inside → 'ok'; outside → 'flag'. Nothing is refused: a flagged step
// is recorded, signed and anchored, and the flag shows on the certificate (Design.md §28.7).
//
// Evidence: "Output {out} kg is {r}% of input {in} kg (expected {min}–{max}% for {process})." with kg and
// r to one decimal; output above input adds ", a gain in weight" (EVAL-102); a placeholder band adds
// "; placeholder range, to be confirmed" (TSK-26.1). Words never accuse (§28.7).

export type MassBalanceInput = { process: Process; crop: MbCrop; inputKg: number; outputKg: number };
export type MassBalanceStatus = 'ok' | 'flag';
export type MassBalanceResult = { status: MassBalanceStatus; ratio: number; band: Band; evidence: string };

/** The process as it reads in a sentence. */
export const PROCESS_WORDS: Record<Process, string> = {
  pulping: 'pulping',
  drying: 'drying',
  hulling_parchment: 'hulling parchment',
  hulling_dry_cherry: 'hulling dry cherry',
};

const kg = (n: number): string => n.toFixed(1);
const positive = (n: number): boolean => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Output as % of input, rounded to one decimal. */
export const ratioOf = (inputKg: number, outputKg: number): number => Math.round((outputKg / inputKg) * 1000) / 10;

export function checkMassBalance({ process, crop, inputKg, outputKg }: MassBalanceInput): MassBalanceResult {
  if (!positive(inputKg) || !positive(outputKg)) throw new RangeError('mass balance: input and output must be positive kilograms');
  const band = bandFor(process, crop);
  const ratio = ratioOf(inputKg, outputKg);
  const status: MassBalanceStatus = ratio >= band[0] && ratio <= band[1] ? 'ok' : 'flag';
  const gain = outputKg > inputKg ? ', a gain in weight' : '';
  const placeholder = isPlaceholderBand(process) ? '; placeholder range, to be confirmed' : '';
  const evidence = `Output ${kg(outputKg)} kg is ${ratio.toFixed(1)}% of input ${kg(inputKg)} kg${gain} (expected ${band[0]}–${band[1]}% for ${PROCESS_WORDS[process]}${placeholder}).`;
  return { status, ratio, band, evidence };
}
