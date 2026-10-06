import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

/**
 * Temporary directories that clean up after themselves (QA-S10-001). Call `tempDirs()` once at a test
 * file's top level (or at a helper module's top level, which runs while the importing file is collected):
 * it registers an `afterAll` on that file, and every directory made with the returned function is removed
 * there, recursively, even if something wrote into it after the test's own cleanup ran.
 */
export function tempDirs(): (prefix: string) => string {
  const dirs = new Set<string>();
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.clear();
  });
  return (prefix) => {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.add(dir);
    return dir;
  };
}
