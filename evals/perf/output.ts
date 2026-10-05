import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, totalmem } from 'node:os';
import { dirname } from 'node:path';

// Where a perf result goes and what it says about the machine (TSK-21.5): baseline-perf-v1.json records
// the S4 measurement with the host's CPU and architecture, and says plainly that the host is not the
// Oracle A1 reference (S3 and the M-003 S4 re-run happen there, TKT-29).

export type Hardware = { cpuModel: string; cpus: number; arch: string; platform: string; memoryGb: number; referenceHost: false; note: string };

export function hostHardware(): Hardware {
  const list = cpus();
  return {
    cpuModel: list[0]?.model.trim() || 'unknown',
    cpus: list.length,
    arch: arch(),
    platform: platform(),
    memoryGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    referenceHost: false,
    note: 'Measured on this host, not the Oracle A1 reference instance (S3, and S4 on the reference host, are TKT-29 at M-003).',
  };
}

/**
 * Write a perf result as JSON at `file`. An existing file is an error (`wx`) unless `overwrite` is set,
 * which only the default ad-hoc path under evals/results/local/ uses.
 */
export function writePerfResult(file: string, result: unknown, opts: { overwrite?: boolean } = {}): string {
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`, { flag: opts.overwrite ? 'w' : 'wx' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`refusing to overwrite ${file}: perf results are never rewritten`);
    throw e;
  }
  return file;
}
