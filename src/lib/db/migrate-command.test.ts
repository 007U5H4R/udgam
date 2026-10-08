import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isMigrateCommand } from './migrate';

// migrate.ts runs its command block only when it IS the command: `tsx src/lib/db/migrate.ts` or the
// image's migrate.mjs. A bundle of another command that imports it (the image's accounts-create.mjs)
// shares its entry's import.meta.url, and must not migrate and close the database under that command.

describe('isMigrateCommand', () => {
  it('is true for tsx src/lib/db/migrate.ts and node /app/migrate.mjs', () => {
    expect(isMigrateCommand(pathToFileURL('/repo/src/lib/db/migrate.ts').href, '/repo/src/lib/db/migrate.ts')).toBe(true);
    expect(isMigrateCommand(pathToFileURL('/app/migrate.mjs').href, '/app/migrate.mjs')).toBe(true);
  });

  it('is false inside another bundled command, even though the URLs match', () => {
    const url = pathToFileURL('/app/accounts-create.mjs').href;
    expect(isMigrateCommand(url, '/app/accounts-create.mjs')).toBe(false);
  });

  it('is false when imported by another program', () => {
    expect(isMigrateCommand(pathToFileURL('/repo/src/lib/db/migrate.ts').href, '/app/server.js')).toBe(false);
    expect(isMigrateCommand(pathToFileURL('/repo/src/lib/db/migrate.ts').href, undefined)).toBe(false);
  });
});
