import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { forcedState, testSurfacesOn, throwIfForced } from './test-surfaces';

// CR-104: the test-only surfaces (`?state=…`, technical-plan §1 and §11) are decided by one rule, here:
// on outside production, or on the Playwright server (E2E=1, a production build never set in a real
// deployment: EXE12, EXE33). Every screen's forced-state helper goes through it.

const PROD = { NODE_ENV: 'production' } as const;
const E2E = { NODE_ENV: 'production', E2E: '1' } as const;
const DEV = { NODE_ENV: 'development' } as const;
const STATES = ['loading', 'empty', 'error'] as const;

describe('testSurfacesOn', () => {
  it('is off in a production deployment, even with another E2E value', () => {
    expect(testSurfacesOn(PROD)).toBe(false);
    expect(testSurfacesOn({ NODE_ENV: 'production', E2E: 'true' })).toBe(false);
    expect(testSurfacesOn({ NODE_ENV: 'production', E2E: '0' })).toBe(false);
  });

  it('is on for the e2e server (production build, E2E=1), in development and under test', () => {
    expect(testSurfacesOn(E2E)).toBe(true);
    expect(testSurfacesOn(DEV)).toBe(true);
    expect(testSurfacesOn({ NODE_ENV: 'test' })).toBe(true);
  });
});

describe('forcedState', () => {
  it('returns only a whitelisted value, and only while the test surfaces are on', () => {
    expect(forcedState('error', STATES, E2E)).toBe('error');
    expect(forcedState('loading', STATES, DEV)).toBe('loading');
    expect(forcedState('throw', STATES, DEV)).toBeNull();
    expect(forcedState(['error'], STATES, DEV)).toBeNull();
    expect(forcedState(undefined, STATES, DEV)).toBeNull();
    expect(forcedState('error', STATES, PROD)).toBeNull();
  });
});

describe('throwIfForced', () => {
  it('throws for ?state=throw only while the test surfaces are on', () => {
    expect(() => throwIfForced('throw', E2E)).toThrow('forced_route_error');
    expect(() => throwIfForced('throw', DEV)).toThrow('forced_route_error');
    expect(() => throwIfForced('throw', PROD)).not.toThrow();
    expect(() => throwIfForced('error', DEV)).not.toThrow();
    expect(() => throwIfForced(['throw'], DEV)).not.toThrow();
  });
});

describe('one rule (CR-104)', () => {
  const SRC = join(__dirname, '..', '..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
    });

  it('no file under src re-implements the production-and-not-E2E gate', () => {
    const self = join(__dirname, 'test-surfaces.ts');
    const gate = /NODE_ENV\s*(===|!==)\s*'production'\s*(&&|\|\|)\s*\w*\.?E2E\s*(!==|===)\s*'1'/;
    const copies = files(SRC)
      .filter((f) => f !== self && gate.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split(sep).join('/'));
    expect(copies).toEqual([]);
  });
});
