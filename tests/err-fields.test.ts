import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { errFields } from '../src/app/_log/err-fields';

// CR-106: a page or action that fell over logged only `errClass`, and every libSQL failure is a
// LibsqlError, so SQLITE_BUSY could not be told from a missing table. The web side now logs the error's
// code as `errCode` (the field name shared with core's CR-007) beside the class, and still never the
// message or any value (§15: class and code only; a message can carry SQL text or user data).

class LibsqlError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

describe('errFields', () => {
  it('names the class and the code of a libSQL or Node error', () => {
    expect(errFields(new LibsqlError('SQLITE_BUSY: database is locked', 'SQLITE_BUSY'))).toEqual({ errClass: 'LibsqlError', errCode: 'SQLITE_BUSY' });
    expect(errFields(Object.assign(new Error('nope'), { code: 'ENOENT' }))).toEqual({ errClass: 'Error', errCode: 'ENOENT' });
  });

  it('has no errCode when the error carries none, or one that is not a plain code', () => {
    expect(errFields(new TypeError('x'))).toEqual({ errClass: 'TypeError' });
    expect(errFields(Object.assign(new Error('x'), { code: 42 }))).toEqual({ errClass: 'Error' });
    expect(errFields(Object.assign(new Error('x'), { code: 'select * from user where email = a@b.c' }))).toEqual({ errClass: 'Error' });
    expect(errFields(Object.assign(new Error('x'), { code: 'X'.repeat(65) }))).toEqual({ errClass: 'Error' });
  });

  it('describes a thrown non-error by its type, never its value', () => {
    expect(errFields('secret-value')).toEqual({ errClass: 'string' });
    expect(errFields({ code: 'SQLITE_BUSY' })).toEqual({ errClass: 'object', errCode: 'SQLITE_BUSY' });
    expect(errFields(null)).toEqual({ errClass: 'object' });
  });

  it('never carries the message', () => {
    expect(JSON.stringify(errFields(new LibsqlError('no such table: user_secret', 'SQLITE_ERROR')))).not.toContain('user_secret');
  });
});

describe('every server-side failure log in the web area carries errCode (CR-106)', () => {
  const APP = join(__dirname, '..', 'src', 'app');
  // The API routes and .well-known belong to the API/core area (core's CR-007).
  const SKIP = ['api', '.well-known'];
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return dir === APP && SKIP.includes(name) ? [] : files(p);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
    });

  it('no log.* call builds errClass by hand', () => {
    const offenders = files(APP).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((l, i) => [l, i + 1] as const)
        .filter(([l]) => /\blog\.(error|warn|info)\(\{\s*errClass:/.test(l) || /^const errClass = /.test(l.trim()))
        .map(([, n]) => `${relative(APP, f).split(sep).join('/')}:${n}`),
    );
    expect(offenders).toEqual([]);
  });
});
