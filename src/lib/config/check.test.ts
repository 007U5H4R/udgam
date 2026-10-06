import { describe, expect, it } from 'vitest';
import { configCheckLine } from './check';
import { invalidEnvNames } from './env';

// EXE55: in the container, the entrypoint checks the configuration before it migrates, and an invalid
// one stops the container with ONE line naming the variables, never their values.

/** Made-up values, built at run time, that must never reach the line. */
const marker = (n: string) => ['not', 'a', 'real', 'value', n].join('-');

describe('invalidEnvNames', () => {
  it('is empty for a valid environment', () => {
    expect(invalidEnvNames({})).toEqual([]);
  });

  it('names a variable that fails its own rule (an enum, a number), in schema order', () => {
    expect(invalidEnvNames({ CAPTURE_DAILY_MAX_CAPTURES: marker('count'), LOG_LEVEL: marker('level') })).toEqual(['LOG_LEVEL', 'CAPTURE_DAILY_MAX_CAPTURES']);
  });

  it('names each variable a cross-variable rule fails, once', () => {
    expect(invalidEnvNames({ NODE_ENV: 'production', REMOTE_SENSING_PROVIDER: 'live' })).toEqual([
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'PUBLIC_BASE_URL',
      'GFW_API_KEY',
      'CDSE_CLIENT_ID',
      'CDSE_CLIENT_SECRET',
    ]);
  });
});

describe('configCheckLine', () => {
  it('is null for a valid environment', () => {
    expect(configCheckLine({ NODE_ENV: 'test' })).toBeNull();
  });

  it('is one `config.invalid: <names>` line, with no value in it', () => {
    const src = {
      NODE_ENV: 'production',
      REMOTE_SENSING_PROVIDER: 'live',
      GFW_API_KEY: marker('gfw'),
      CDSE_CLIENT_SECRET: marker('cdse'),
      PUBLIC_BASE_URL: `http://${marker('public')}.example`,
      BETTER_AUTH_URL: `https://user:${marker('pw')}@udgam.example`,
    };
    const line = configCheckLine(src);
    expect(line).toBe('config.invalid: BETTER_AUTH_SECRET, BETTER_AUTH_URL, PUBLIC_BASE_URL, CDSE_CLIENT_ID');
    expect(line).not.toContain('not-a-real');
    expect(line).not.toContain('\n');
  });
});
