import { defineConfig } from 'vitest/config';

const exclude = ['**/node_modules/**', '.next/**', '.claude/**', '.design/**', 'backlog/**', 'evals/results/**'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts', 'evals/**/*.test.ts'],
          exclude: [...exclude, '**/*.int.test.ts'],
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
    ],
  },
});
