import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempDb, type TempDb } from '../../../tests/helpers/db';

// Final branch review finding 9 (TASK-27): a drizzle-kit rebuild of `user` (CREATE __new_user → copy →
// DROP → RENAME) re-parses every trigger in the schema, so it fails while a trigger on ANOTHER table
// names `user`, and its DROP removes every trigger ON `user`. 0028 dropped the 0009 triggers for the
// 0029 rebuild; 0030 and 0034 have since added more. docs/exec/migrations.md lists every one, so the
// next `user` rebuild drops and recreates them all. This test fails when a migration adds a trigger
// that reads `user` and the list is not updated.

/** A trigger body that reads the `user` table (quoted or bare), not a column such as user_id. */
const NAMES_USER = /\b(?:from|join)\s+(?:"user"|`user`|user)(?![\w"`])/i;

let t: TempDb;
beforeAll(async () => {
  t = await tempDb();
});
afterAll(async () => {
  await t.cleanup();
});

async function triggers(): Promise<{ name: string; table: string; sql: string }[]> {
  const r = await t.client.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name");
  return r.rows.map((row) => ({ name: String(row.name), table: String(row.tbl_name), sql: String(row.sql) }));
}

/** The trigger names listed (one `- \`name\`` bullet each) under the given heading of migrations.md. */
function listed(heading: string): string[] {
  const doc = readFileSync('docs/exec/migrations.md', 'utf8');
  const start = doc.indexOf(heading);
  expect(start, `"${heading}" in docs/exec/migrations.md`).toBeGreaterThanOrEqual(0);
  const section = doc.slice(start + heading.length).split(/\n#{2,4} /)[0]!;
  return [...section.matchAll(/^- `([a-z0-9_]+)`/gm)].map((m) => m[1]!).sort();
}

describe('triggers a `user` rebuild must drop and recreate (docs/exec/migrations.md)', () => {
  it('every trigger on another table that reads `user` is listed', async () => {
    const reading = (await triggers()).filter((x) => x.table !== 'user' && NAMES_USER.test(x.sql)).map((x) => x.name);
    expect(reading.length).toBeGreaterThan(0);
    expect(listed('#### Triggers on other tables that read `user`')).toEqual(reading.sort());
  });

  it('every trigger on `user` itself is listed', async () => {
    const own = (await triggers()).filter((x) => x.table === 'user').map((x) => x.name);
    expect(listed('#### Triggers on `user` itself')).toEqual(own.sort());
  });
});
