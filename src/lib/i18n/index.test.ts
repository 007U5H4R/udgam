import { describe, expect, it } from 'vitest';
import { en } from './en';
import { t } from './index';

describe('t()', () => {
  it('returns the English string for a key', () => {
    expect(t('signIn.submit')).toBe('Sign in');
  });

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(t('signIn.title', { app: 'Udgam' })).toBe('Sign in to Udgam');
    expect(t('signIn.title')).toBe('Sign in to {app}');
  });

  it('the sign-in error never says which field was wrong (TC-020)', () => {
    expect(t('signIn.error')).toBe('Email or password is not right.');
  });

  it('has no empty strings', () => {
    for (const [k, v] of Object.entries(en)) expect(v.trim(), k).not.toBe('');
  });
});
