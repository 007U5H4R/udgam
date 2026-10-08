import { defineConfig } from 'vitest/config';

const exclude = ['**/node_modules/**', '.next/**', '.claude/**', '.design/**', 'backlog/**', 'evals/results/**'];

// The `evm` project (TKT-24, TSK-24.4) needs the pinned Foundry (anvil, forge) and runs only when asked
// for: `pnpm test:evm` (= `vitest run --project evm`), as CI's contracts.yml does. Its global setup FAILS,
// naming the fix, when anvil is missing; it never skips. `pnpm test` runs unit + integration only.
const evmRequested = process.argv.some((a, i, all) => a === '--project=evm' || (a === '--project' && all[i + 1] === 'evm'));

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts', 'evals/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: [...exclude, '**/*.int.test.ts', '**/*.evm.test.ts'],
          // Under 4+ parallel agents (load 15-24 on 4 cores) the 5 s default is too tight for tests that
          // spawn tsx children or run the harness (EXE, TASK-19 follow-up).
          testTimeout: 20_000,
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['**/*.int.test.ts'],
          exclude,
          pool: 'forks',
          testTimeout: 20_000,
          // Cold imports (Better Auth, libSQL) in beforeAll hooks exceed 10 s under the same load.
          hookTimeout: 60_000,
        },
      },
      ...(evmRequested
        ? [
            {
              test: {
                name: 'evm',
                environment: 'node' as const,
                include: ['**/*.evm.test.ts'],
                exclude,
                pool: 'forks' as const,
                // One shared Anvil; each test deploys its own registry. Files run one at a time.
                fileParallelism: false,
                globalSetup: ['src/lib/ledger/evm/testing/global-setup.ts'],
                testTimeout: 120_000,
                hookTimeout: 180_000,
              },
            },
          ]
        : []),
    ],
  },
});
