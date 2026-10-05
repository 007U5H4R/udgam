import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { hostHardware, writePerfResult } from './output';

// TSK-21.5 tooling: `pnpm eval:perf --out=<file>` writes the S4 result where it is asked (baseline-perf-v1.json
// in the formal run, the scratchpad in a dry run), never over an existing file, with the host's hardware.

const dir = mkdtempSync(join(tmpdir(), 'udgam-perf-out-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('perf output (TSK-21.5)', () => {
  it('records the CPU, core count and architecture, and that this is not the Oracle A1 reference host', () => {
    const h = hostHardware();
    expect(h.cpus).toBeGreaterThan(0);
    expect(h.arch).toMatch(/^(x64|arm64|ia32|arm|ppc64|s390x|riscv64|loong64|mips|mipsel|ppc|s390)$/);
    expect(h.cpuModel.length).toBeGreaterThan(0);
    expect(h.referenceHost).toBe(false);
    expect(h.note).toMatch(/not the Oracle A1/);
  });

  it('writes the result once, creating the directory, and refuses to overwrite it', () => {
    const file = join(dir, 'nested', 'baseline-perf-v1.json');
    expect(writePerfResult(file, { gate: 'S4', pass: true })).toBe(file);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ gate: 'S4', pass: true });
    expect(() => writePerfResult(file, { gate: 'S4', pass: false })).toThrow(/refusing to overwrite .*baseline-perf-v1\.json/);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ gate: 'S4', pass: true });
  });

  it('replaces the file only when asked (the default ad-hoc path)', () => {
    const file = join(dir, 'perf-s4-abc1234.json');
    writePerfResult(file, { run: 1 }, { overwrite: true });
    writePerfResult(file, { run: 2 }, { overwrite: true });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ run: 2 });
  });
});
