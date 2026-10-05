import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatScore, istDate, istMonth, kg1 } from './format';

// Final branch review finding 4 (TASK-22): one copy of each display helper that parallel tickets had
// duplicated, and no two exported helpers named istDate with different outputs.

describe('shared display formats', () => {
  it('formatScore: whole numbers bare, otherwise one decimal', () => {
    expect(formatScore(84)).toBe('84');
    expect(formatScore(91.5)).toBe('91.5');
    expect(formatScore(91.25)).toBe('91.3');
    expect(formatScore(0)).toBe('0');
  });

  it('kg1: one decimal, rounded to the tenth', () => {
    expect(kg1(44)).toBe('44.0');
    expect(kg1(38.5)).toBe('38.5');
    expect(kg1(612.04)).toBe('612.0');
    expect(kg1(38.25)).toBe('38.3');
  });

  it('istDate: the calendar date in IST (UTC+05:30), independent of the host zone', () => {
    expect(istDate('2026-09-30T18:29:59.999Z')).toBe('2026-09-30');
    expect(istDate('2026-09-30T18:30:00.000Z')).toBe('2026-10-01');
  });

  it('istMonth: YYYY-MM in IST', () => {
    expect(istMonth('2026-09-30T18:29:59.999Z')).toBe('2026-09');
    expect(istMonth('2026-09-30T18:30:00.000Z')).toBe('2026-10');
    expect(istMonth('2026-09-30T19:00:00.000Z')).toBe('2026-10');
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('no duplicate helper definitions under src/', () => {
  it.each(['formatScore', 'istMonth', 'kg1', 'istDate'])('%s is defined once, in src/lib/format.ts', (name) => {
    const def = new RegExp(`^export (const ${name}\\s*=|function ${name}\\s*\\()`, 'm');
    expect(sources('src').filter((f) => def.test(readFileSync(f, 'utf8')))).toEqual(['src/lib/format.ts']);
  });
});
