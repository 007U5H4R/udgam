import { defineConfig } from 'vitest/config';

const exclude = ['**/node_modules/**', '.next/**', '.claude/**', '.design/**', 'backlog/**', 'evals/results/**'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          exclude: [...exclude, '**/*.int.test.ts'],
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
        },
      },
    ],
  },
});
