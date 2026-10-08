import { existsSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { appVersion } from '../harness/provenance';
import type { TreeState } from '../harness/tree-state';
import { hostHardware } from './output';

// Shared by the perf suites (S4 TSK-16.10/21.5, S3 TSK-29.1): flag reading, the Chromium to launch and
// the provenance block every perf result carries.

/** `--name=value` → value (`--name=` → ''); absent, or given bare as `--name`, → undefined. */
export function argOf(argv: string[], name: string): string | undefined {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit?.includes('=') ? hit.slice(hit.indexOf('=') + 1) : undefined;
}

const PRE_INSTALLED = '/opt/pw-browsers/chromium';

/**
 * Chromium for a perf run (no `playwright install` in the cloud VM): PW_CHROMIUM_PATH, else the VM's
 * pre-installed build outside CI, else Playwright's own download.
 */
export function chromiumLaunchOptions(): { executablePath?: string } {
  const executablePath = process.env.PW_CHROMIUM_PATH ?? (!process.env.CI && existsSync(PRE_INSTALLED) ? PRE_INSTALLED : undefined);
  return executablePath ? { executablePath } : {};
}

/** The provenance block of a perf result: the tree as the release judges it, the host and the run's timing. */
export function perfProvenance(started: number, git: TreeState) {
  return {
    harness: { name: 'udgam-eval-perf', version: '0.1.0' },
    appVersion: appVersion(),
    git,
    environment: process.env.CI ? 'ci' : 'local',
    node: process.version,
    os: { platform: platform(), arch: arch() },
    hardware: hostHardware(),
    timestampUtc: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
}
