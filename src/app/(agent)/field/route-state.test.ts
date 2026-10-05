import { afterEach, describe, expect, it, vi } from 'vitest';

// TASK-12 r2 (quality #2, spec #1): the test-only forced states of the /field pages (`?state=…`) are
// honoured outside production or with E2E=1, and are inert in a production deployment without E2E=1:
// `?state=throw` never throws there, and `?state=empty` is no state.

async function routeState(env: { NODE_ENV: string; E2E?: string }) {
  vi.resetModules();
  vi.doMock('../../../lib/config/env', () => ({ env }));
  return import('./route-state');
}

afterEach(() => {
  vi.doUnmock('../../../lib/config/env');
  vi.resetModules();
});

describe('route-state test surfaces', () => {
  it('production without E2E=1: ?state=throw is inert and no state is forced', async () => {
    const { throwIfForced, forcedState } = await routeState({ NODE_ENV: 'production' });
    expect(() => throwIfForced('throw')).not.toThrow();
    for (const v of ['loading', 'empty', 'error', 'throw']) expect(forcedState(v)).toBeNull();
    const withOtherE2E = await routeState({ NODE_ENV: 'production', E2E: '0' });
    expect(() => withOtherE2E.throwIfForced('throw')).not.toThrow();
  });

  it('production with E2E=1, and development: ?state=throw throws and the states are honoured', async () => {
    for (const env of [{ NODE_ENV: 'production', E2E: '1' }, { NODE_ENV: 'development' }, { NODE_ENV: 'test' }]) {
      const { throwIfForced, forcedState } = await routeState(env);
      expect(() => throwIfForced('throw'), JSON.stringify(env)).toThrow('forced_route_error');
      expect(() => throwIfForced('empty')).not.toThrow();
      expect(forcedState('empty')).toBe('empty');
      expect(forcedState('nonsense')).toBeNull();
    }
  });
});
