import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` writes SQL migrations from src/lib/db/schema.ts; they are committed and applied
// by src/lib/db/migrate.ts (at boot, by `pnpm db:migrate`, and in tests via tempDb()).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
});
