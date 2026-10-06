import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { errFields } from '../src/lib/log';

// CR-106 / CR-007: a page or action that fell over logged only `errClass`, and every libSQL failure is a
// LibsqlError (drizzle wraps it), so SQLITE_BUSY could not be told from a missing table. There is ONE
// helper, `errFields` in src/lib/log.ts: the class, plus the driver's `code` (and a LibsqlError's
// `rawCode`) found through the cause chain, constant-style codes only, never the message. The web area's
// catch sites use it too; the semantics are tested in src/lib/log.test.ts, the web-side cases here.

class LibsqlError extends Error {
  constructor(
    message: string,
    public code: string,
    public rawCode?: number,
  ) {
    super(message);
  }
}

describe('errFields on the failures the web pages and actions see', () => {
  it('a libSQL failure, bare or wrapped by drizzle, carries its code; a Node error its errno name', () => {
    expect(errFields(new LibsqlError('SQLITE_BUSY: database is locked', 'SQLITE_BUSY', 5))).toEqual({ errClass: 'LibsqlError', code: 'SQLITE_BUSY', rawCode: 5 });
    class DrizzleQueryError extends Error {}
    const wrapped = new DrizzleQueryError('Failed query: select … from "user"', { cause: new LibsqlError('SQLITE_ERROR: no such table: user', 'SQLITE_ERROR', 1) });
    expect(errFields(wrapped)).toEqual({ errClass: 'DrizzleQueryError', code: 'SQLITE_ERROR', rawCode: 1 });
    expect(errFields(Object.assign(new Error('nope'), { code: 'ENOENT' }))).toEqual({ errClass: 'Error', code: 'ENOENT' });
  });

  it('never the message or any value', () => {
    expect(JSON.stringify(errFields(new LibsqlError('no such table: user_secret', 'SQLITE_ERROR')))).not.toContain('user_secret');
    expect(errFields(Object.assign(new Error('x'), { code: 'select * from user where email = a@b.c' }))).toEqual({ errClass: 'Error' });
    expect(errFields('secret-value')).toEqual({ errClass: 'string' });
  });
});

describe('one error-code helper (CR-106 / CR-007)', () => {
  const APP = join(__dirname, '..', 'src', 'app');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
    });
  const where = (f: string, n: number) => `${relative(APP, f).split(sep).join('/')}:${n}`;

  it('the web copy is gone and nothing imports it', () => {
    expect(existsSync(join(APP, '_log', 'err-fields.ts'))).toBe(false);
    const importers = files(APP).filter((f) => /_log\/err-fields/.test(readFileSync(f, 'utf8')));
    expect(importers.map((f) => relative(APP, f))).toEqual([]);
  });

  it('no log.* call under src/app (pages, actions, API routes and .well-known; CR-008) builds errClass by hand', () => {
    const offenders = files(APP).flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((l, i) => [l, i + 1] as const)
          .filter(([l]) => /\blog\.(error|warn|info)\(\{\s*errClass:/.test(l) || /^const errClass = /.test(l.trim()))
          .map(([, n]) => where(f, n)),
      );
    expect(offenders).toEqual([]);
  });
});
