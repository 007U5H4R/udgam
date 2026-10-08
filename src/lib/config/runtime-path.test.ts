import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { escrowDeploymentPath } from '../agreements/deployment';
import { evmPaths } from '../ledger/evm/deployment';
import { runtimePath } from './runtime-path';

// Final branch review finding 1 (TASK-25): DATA_DIR and key paths are built at run time through
// runtimePath, which the file tracer is told to ignore, so no private key under DATA_DIR is copied into a
// server trace. The resolved paths themselves are unchanged.

describe('runtimePath', () => {
  it('resolves like path.resolve', () => {
    expect(runtimePath('/srv/udgam', 'keys', 'evm', 'ORG-1.key')).toBe('/srv/udgam/keys/evm/ORG-1.key');
    expect(runtimePath('/etc/udgam/op.key')).toBe('/etc/udgam/op.key');
    expect(runtimePath('/srv/udgam/', '../other', 'x.json')).toBe('/srv/other/x.json');
  });

  it('carries the tracer ignore hint (removing it re-traces the whole project, keys included)', () => {
    expect(readFileSync('src/lib/config/runtime-path.ts', 'utf8')).toContain('resolve(/* turbopackIgnore: true */ ...segments)');
  });
});

describe('every DATA_DIR root goes through runtimePath (EXE39, CR-004)', () => {
  // The media store, the thumbnail cache and the staging area build their paths from DATA_DIR. A bare
  // path.resolve/join there is one literal segment away from re-tracing ./data into a route artifact.
  it.each(['src/lib/media/store.ts', 'src/lib/media/thumbs.ts', 'src/lib/capture/staging.ts'])('%s imports runtimePath and has no bare resolve()', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).toMatch(/import \{ runtimePath \} from '\.\.\/config\/runtime-path';/);
    expect(src).not.toMatch(/(?<![.\w])resolve\(/);
  });
});

describe('DATA_DIR paths keep their documented defaults', () => {
  it('evmPaths: deployment.json and the operator key under DATA_DIR, or the override', () => {
    expect(evmPaths({ DATA_DIR: '/srv/udgam' })).toEqual({
      rpcUrl: 'http://127.0.0.1:8545',
      deploymentPath: '/srv/udgam/evm/deployment.json',
      operatorKeyPath: '/srv/udgam/keys/evm-operator.key',
    });
    expect(evmPaths({ DATA_DIR: '/srv/udgam', EVM_OPERATOR_KEY_PATH: '/etc/udgam/op.key', ANVIL_RPC_URL: 'http://anvil:8545' })).toEqual({
      rpcUrl: 'http://anvil:8545',
      deploymentPath: '/srv/udgam/evm/deployment.json',
      operatorKeyPath: '/etc/udgam/op.key',
    });
  });

  it('escrowDeploymentPath: DATA_DIR/evm/agreements.json', () => {
    expect(escrowDeploymentPath('/srv/udgam')).toBe('/srv/udgam/evm/agreements.json');
  });
});
