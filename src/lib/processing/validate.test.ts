import { describe, expect, it } from 'vitest';
import { checkStepFields, parseKg } from './validate';

// Design.md §28.7 field checks for "Record a processing step" (D10): the same rules and words in the
// browser and on the server. Messages are the literals of the §28.7 table.

describe('parseKg', () => {
  it('accepts digits with at most one decimal place, above 0', () => {
    expect(parseKg('600')).toBe(600);
    expect(parseKg('600.0')).toBe(600);
    expect(parseKg(' 480.5 ')).toBe(480.5);
    for (const bad of ['', '0', '0.0', '-1', '600.25', '6,00', '1e3', 'abc', '600.', '.5', '100000']) expect(parseKg(bad), bad).toBeNull();
  });
});

describe('checkStepFields (§28.7)', () => {
  it('passes a complete step, output above input included (flagged later as a gain, EVAL-102)', () => {
    expect(checkStepFields({ process: 'hulling_parchment', inputKg: '600.0', outputKg: '650.0' })).toEqual({ ok: true, value: { process: 'hulling_parchment', inputKg: 600, outputKg: 650 } });
  });

  it('names what to do for each field that needs a change', () => {
    expect(checkStepFields({ process: '', inputKg: '', outputKg: '' })).toEqual({
      ok: false,
      errors: {
        process: 'Choose the process you did.',
        inputKg: 'Enter the input weight in kg, for example 600.0.',
        outputKg: 'Enter the output weight in kg, for example 480.0.',
      },
    });
    expect(checkStepFields({ process: 'roasting', inputKg: '600,5', outputKg: '0' })).toEqual({
      ok: false,
      errors: {
        process: 'Choose the process you did.',
        inputKg: 'Enter a weight above 0 kg in digits, for example 600.0.',
        outputKg: 'Output must be more than 0 kg.',
      },
    });
  });

  it('never uses the words invalid, wrong, error or not allowed', () => {
    const r = checkStepFields({ process: 'x', inputKg: 'x', outputKg: 'x' });
    expect(r.ok).toBe(false);
    for (const m of Object.values(r.ok ? {} : r.errors)) expect(m).not.toMatch(/invalid|wrong|error|not allowed/i);
  });
});
