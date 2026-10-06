import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// CR-102 (EXE39): every DATA_DIR path is built through src/lib/config/runtime-path.ts (`turbopackIgnore`),
// so the file tracer never copies data/, keys or seed-credentials.txt into a standalone artifact because
// of a path it could read. Under src/app no server file builds a path with a bare node:path `join` or
// `resolve` (the demo attacks reader and the certificate download were the last two); `relative` and
// `isAbsolute`, which name no file, stay allowed.

const APP = join(__dirname, '..', 'src', 'app');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const PATH_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"](?:node:)?path['"]/g;

describe('DATA_DIR paths under src/app go through runtimePath (CR-102, EXE39)', () => {
  it('no src/app file imports join or resolve from node:path', () => {
    const offenders = files(APP).flatMap((f) => {
      const names = [...readFileSync(f, 'utf8').matchAll(PATH_IMPORT)].flatMap((m) => m[1]!.split(',').map((s) => s.trim().split(/\s+as\s+/)[0]));
      const bad = names.filter((n) => n === 'join' || n === 'resolve');
      return bad.length ? [`${relative(APP, f).split(sep).join('/')}: ${bad.join(', ')}`] : [];
    });
    expect(offenders).toEqual([]);
  });

  it('the two DATA_DIR readers use runtimePath', () => {
    for (const f of ['(admin)/admin/demo/attacks.ts', '(admin)/admin/plots/[plotId]/attestation/[attestationId]/route.ts']) {
      expect(readFileSync(join(APP, ...f.split('/')), 'utf8'), f).toMatch(/runtimePath\(/);
    }
  });
});
