import { beforeEach, describe, expect, it, vi } from 'vitest';

// Final branch review finding 6 (TASK-7): the plot screens' forced view state reads NODE_ENV through
// the validated environment (env.ts), like its seven siblings, never process.env directly. The env
// module is replaced here, so process.env.NODE_ENV ('test' under vitest) must not decide anything.

const fake = vi.hoisted(() => ({ env: { NODE_ENV: 'production', E2E: undefined as string | undefined } }));
vi.mock('../../../../lib/config/env', () => fake);

const { forcedState } = await import('./state');

beforeEach(() => {
  fake.env.NODE_ENV = 'production';
  fake.env.E2E = undefined;
});

describe('forcedState (plots)', () => {
  it('is off in a production build without E2E=1', () => {
    expect(forcedState('error')).toBeNull();
    expect(forcedState('loading')).toBeNull();
  });

  it('is on for the e2e server (production build, E2E=1) and in development', () => {
    fake.env.E2E = '1';
    expect(forcedState('error')).toBe('error');
    fake.env.E2E = undefined;
    fake.env.NODE_ENV = 'development';
    expect(forcedState('empty')).toBe('empty');
    expect(forcedState('loading')).toBe('loading');
  });

  it('ignores anything that is not a forceable state', () => {
    fake.env.NODE_ENV = 'development';
    expect(forcedState('throw')).toBeNull();
    expect(forcedState(['error'])).toBeNull();
    expect(forcedState(undefined)).toBeNull();
  });
});
