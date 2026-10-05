import { describe, expect, it } from 'vitest';
import { checkMassBalance } from './mass-balance';

// TSK-26.2 (TC-086, EVAL-100–102): output/input against the configured band for the process and crop.
// Inside → ok; outside → flag with an evidence sentence that states the value and the band; output above
// input → flag worded as a gain in weight. Nothing is ever refused. Band edges are inclusive, compared on
// the ratio as shown (one decimal). Expected values are literals from technical-plan TSK-26.2 and
// Design.md §28.7.

describe('checkMassBalance (TSK-26.2)', () => {
  it('EVAL-100: pulping 1,000 kg of cherry into an output inside the band → ok, placeholder range said so', () => {
    expect(checkMassBalance({ process: 'pulping', crop: 'arabica', inputKg: 1000, outputKg: 420 })).toEqual({
      status: 'ok',
      ratio: 42,
      band: [35, 50],
      evidence: 'Output 420.0 kg is 42.0% of input 1000.0 kg (expected 35–50% for pulping; placeholder range, to be confirmed).',
    });
  });

  it('inside the band for hulling parchment (Arabica) → ok, with the value-and-band sentence', () => {
    expect(checkMassBalance({ process: 'hulling_parchment', crop: 'arabica', inputKg: 600, outputKg: 480 })).toEqual({
      status: 'ok',
      ratio: 80,
      band: [75, 85],
      evidence: 'Output 480.0 kg is 80.0% of input 600.0 kg (expected 75–85% for hulling parchment).',
    });
  });

  it('EVAL-101: below the band → flag, stating the ratio and the band', () => {
    expect(checkMassBalance({ process: 'hulling_parchment', crop: 'arabica', inputKg: 600, outputKg: 420 })).toEqual({
      status: 'flag',
      ratio: 70,
      band: [75, 85],
      evidence: 'Output 420.0 kg is 70.0% of input 600.0 kg (expected 75–85% for hulling parchment).',
    });
  });

  it('EVAL-102: output greater than input → flag worded as a gain in weight', () => {
    expect(checkMassBalance({ process: 'hulling_parchment', crop: 'arabica', inputKg: 600, outputKg: 650 })).toEqual({
      status: 'flag',
      ratio: 108.3,
      band: [75, 85],
      evidence: 'Output 650.0 kg is 108.3% of input 600.0 kg, a gain in weight (expected 75–85% for hulling parchment).',
    });
  });

  it('EVAL-102: above the band without a gain → flag, no gain wording', () => {
    const r = checkMassBalance({ process: 'hulling_parchment', crop: 'arabica', inputKg: 600, outputKg: 540 });
    expect(r).toMatchObject({ status: 'flag', ratio: 90 });
    expect(r.evidence).toBe('Output 540.0 kg is 90.0% of input 600.0 kg (expected 75–85% for hulling parchment).');
  });

  it('output equal to input is no gain; above any band it is flagged without the gain wording', () => {
    const r = checkMassBalance({ process: 'drying', crop: 'robusta', inputKg: 100, outputKg: 100 });
    expect(r).toMatchObject({ status: 'flag', ratio: 100, band: [40, 60] });
    expect(r.evidence).toBe('Output 100.0 kg is 100.0% of input 100.0 kg (expected 40–60% for drying; placeholder range, to be confirmed).');
  });

  it('band edges are inclusive', () => {
    expect(checkMassBalance({ process: 'hulling_parchment', crop: 'arabica', inputKg: 600, outputKg: 450 }).status).toBe('ok'); // 75.0
    expect(checkMassBalance({ process: 'hulling_parchment', crop: 'arabica', inputKg: 600, outputKg: 510 }).status).toBe('ok'); // 85.0
    expect(checkMassBalance({ process: 'hulling_parchment', crop: 'arabica', inputKg: 600, outputKg: 449.4 }).status).toBe('flag'); // 74.9
    expect(checkMassBalance({ process: 'hulling_parchment', crop: 'arabica', inputKg: 600, outputKg: 510.4 }).status).toBe('flag'); // 85.1
    // decimal band edges (dry cherry, Robusta 47.7–57.7)
    expect(checkMassBalance({ process: 'hulling_dry_cherry', crop: 'robusta', inputKg: 1000, outputKg: 477 })).toMatchObject({ status: 'ok', ratio: 47.7 });
    expect(checkMassBalance({ process: 'hulling_dry_cherry', crop: 'robusta', inputKg: 1000, outputKg: 476.4 })).toMatchObject({ status: 'flag', ratio: 47.6 });
  });

  it('the ratio is shown and compared to one decimal (what the sentence says is what was judged)', () => {
    // 449.9 / 600 = 74.983…% → shown as 75.0% → inside 75–85
    const r = checkMassBalance({ process: 'hulling_parchment', crop: 'arabica', inputKg: 600, outputKg: 449.9 });
    expect(r).toMatchObject({ status: 'ok', ratio: 75 });
    expect(r.evidence).toBe('Output 449.9 kg is 75.0% of input 600.0 kg (expected 75–85% for hulling parchment).');
  });

  it('decimal bands keep their decimal in the sentence (hulling dry cherry, Arabica 48.5–58.5)', () => {
    expect(checkMassBalance({ process: 'hulling_dry_cherry', crop: 'arabica', inputKg: 1000, outputKg: 535 }).evidence).toBe(
      'Output 535.0 kg is 53.5% of input 1000.0 kg (expected 48.5–58.5% for hulling dry cherry).',
    );
  });

  it('uses the crop band (Robusta hulling parchment is 80–90)', () => {
    expect(checkMassBalance({ process: 'hulling_parchment', crop: 'robusta', inputKg: 600, outputKg: 480 })).toMatchObject({ status: 'ok', band: [80, 90] });
    expect(checkMassBalance({ process: 'hulling_parchment', crop: 'robusta', inputKg: 600, outputKg: 470 })).toMatchObject({ status: 'flag', band: [80, 90] });
  });

  it('refuses inputs that are not positive finite kilograms (a programming error, not a farmer-facing refusal)', () => {
    expect(() => checkMassBalance({ process: 'pulping', crop: 'arabica', inputKg: 0, outputKg: 1 })).toThrow(RangeError);
    expect(() => checkMassBalance({ process: 'pulping', crop: 'arabica', inputKg: 10, outputKg: 0 })).toThrow(RangeError);
    expect(() => checkMassBalance({ process: 'pulping', crop: 'arabica', inputKg: Number.NaN, outputKg: 1 })).toThrow(RangeError);
  });
});
