import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// TSK-27.6: the optional keep-busy job is capped (at most 40 % of the CPU, at most 59 minutes), runs at
// nice 19, ends on time, and refuses malformed input. docs/ops/oracle-idle.md says when to use it.

const run = (args: string[], env: Record<string, string>) => {
  const childEnv: NodeJS.ProcessEnv = { NODE_ENV: 'test', PATH: process.env.PATH ?? '', TMPDIR: process.env.TMPDIR ?? '/tmp' };
  const t0 = Date.now();
  const r = spawnSync('bash', ['deploy/cron/keep-busy.sh', ...args], { encoding: 'utf8', env: Object.assign(childEnv, env) });
  return { ...r, ms: Date.now() - t0 };
};

describe('keep-busy.sh', () => {
  it('caps the share at 40 % and ends when its time is up', () => {
    const r = run(['5'], { KEEP_BUSY_PERCENT: '90', KEEP_BUSY_SECONDS: '2' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^keep-busy: 40% of \d+ cores for 2s at nice 19$/m);
    expect(r.stdout).toContain('keep-busy: done');
    expect(r.ms).toBeLessThan(6_000);
  });

  it('caps the duration at 59 minutes', () => {
    const r = run(['600'], { KEEP_BUSY_DRY_RUN: '1' });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^keep-busy: 25% of \d+ cores for 3540s at nice 19$/m);
  });

  it.each([[['ten'], {}], [['5'], { KEEP_BUSY_PERCENT: 'lots' }]])('refuses malformed input %j', (args, env) => {
    expect(run(args, env as Record<string, string>).status).toBe(2);
  });
});
