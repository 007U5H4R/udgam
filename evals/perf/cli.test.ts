import { describe, expect, it } from 'vitest';
import { treeState } from '../harness/tree-state';
import { argOf, chromiumLaunchOptions, perfProvenance } from './cli';

// The perf suites' shared CLI helpers (S4 TSK-21.5, S3 TSK-29.1): S4's flag reading and provenance keep
// their pre-extraction behaviour and key order, so an S4 result file is unchanged.

describe('perf CLI helpers', () => {
  it('argOf reads --name=value; --name= is empty; absent or bare is undefined (S4 semantics)', () => {
    const argv = ['--target=http://x', '--out=', '--only', '--runs=10'];
    expect(argOf(argv, 'target')).toBe('http://x');
    expect(argOf(argv, 'out')).toBe('');
    expect(argOf(argv, 'only')).toBeUndefined();
    expect(argOf(argv, 'path')).toBeUndefined();
    expect(argOf(['--runs-extra=3'], 'runs')).toBeUndefined();
  });

  it('perfProvenance keeps S4’s keys in S4’s order', () => {
    const p = perfProvenance(Date.now(), treeState());
    expect(Object.keys(p)).toEqual(['harness', 'appVersion', 'git', 'environment', 'node', 'os', 'hardware', 'timestampUtc', 'durationMs']);
    expect(p.harness).toEqual({ name: 'udgam-eval-perf', version: '0.1.0' });
    expect(p.hardware.referenceHost).toBe(false);
  });

  it('chromiumLaunchOptions prefers PW_CHROMIUM_PATH', () => {
    const before = process.env.PW_CHROMIUM_PATH;
    process.env.PW_CHROMIUM_PATH = '/opt/some/chromium';
    try {
      expect(chromiumLaunchOptions()).toEqual({ executablePath: '/opt/some/chromium' });
    } finally {
      if (before === undefined) delete process.env.PW_CHROMIUM_PATH;
      else process.env.PW_CHROMIUM_PATH = before;
    }
  });
});
