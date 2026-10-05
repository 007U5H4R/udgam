import { describe, expect, it } from 'vitest';
import { FoundryMissing, foundryBin, foundryEnv } from './foundry';

// TSK-24.4: without the pinned Foundry the EVM tooling (and so the `evm` vitest project's global setup)
// FAILS naming the fix; it never skips. Children get HOME only, never the parent's variables.
describe('foundry tooling', () => {
  it('a missing binary is an error that names cloud-setup.sh and the pinned version', () => {
    expect(() => foundryBin('anvil', '/nonexistent-udgam-home')).toThrow(FoundryMissing);
    expect(() => foundryBin('anvil', '/nonexistent-udgam-home')).toThrow(/scripts\/cloud-setup\.sh.*1\.8\.3/);
  });

  it('child processes get a minimal environment', () => {
    expect(Object.keys(foundryEnv()).sort()).toEqual(['HOME']);
    expect(Object.keys(foundryEnv({ FOUNDRY_BROADCAST: '/tmp/x' })).sort()).toEqual(['FOUNDRY_BROADCAST', 'HOME']);
  });
});
