import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatKg, istDateTime } from './format';
import { formatScore } from '../format';

// Display helpers for the batch screens (technical-plan §1 Time and Numbers, §11 States).

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('istDateTime', () => {
  it('shows IST (UTC+05:30) by explicit offset, whatever the host zone', () => {
    expect(istDateTime('2026-09-30T08:35:12.345Z')).toBe('30 Sep 2026, 14:05 IST');
    expect(istDateTime('2026-12-31T18:30:00.000Z')).toBe('1 Jan 2027, 00:00 IST');
    expect(istDateTime('2026-01-05T00:00:00.000Z')).toBe('5 Jan 2026, 05:30 IST');
  });
});

describe('formatKg and formatScore', () => {
  it('prints whole numbers bare and halves with one decimal', () => {
    expect(formatKg(128.5)).toBe('128.5');
    expect(formatKg(40)).toBe('40');
    expect(formatKg(0.5)).toBe('0.5');
    expect(formatScore(84)).toBe('84');
    expect(formatScore(91.5)).toBe('91.5');
    expect(formatScore(91.25)).toBe('91.3');
  });
});

describe('forcedViewState (?state=, technical-plan §11)', () => {
  it('honours loading, empty and error outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { forcedViewState } = await import('./view-state');
    expect(forcedViewState('loading')).toBe('loading');
    expect(forcedViewState('empty')).toBe('empty');
    expect(forcedViewState('error')).toBe('error');
    expect(forcedViewState('working')).toBeNull();
    expect(forcedViewState(['error'])).toBeNull();
    expect(forcedViewState(undefined)).toBeNull();
  });

  it('is off in a production build unless E2E=1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_SECRET', 'x'.repeat(32));
    vi.stubEnv('E2E', '0');
    vi.stubEnv('REMOTE_SENSING_PROVIDER', 'live'); // production refuses the fixture provider outside E2E (EXE12); placeholder keys
    vi.stubEnv('GFW_API_KEY', 'k');
    vi.stubEnv('CDSE_CLIENT_ID', 'i');
    vi.stubEnv('CDSE_CLIENT_SECRET', 's');
    vi.stubEnv('PUBLIC_BASE_URL', 'https://udgam.example'); // https in production (DES-219)
    vi.stubEnv('BETTER_AUTH_URL', 'https://udgam.example');
    expect((await import('./view-state')).forcedViewState('error')).toBeNull();
    vi.resetModules();
    vi.stubEnv('E2E', '1');
    expect((await import('./view-state')).forcedViewState('error')).toBe('error');
  });
});
