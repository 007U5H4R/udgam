import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDb } from './client';
import { MIGRATIONS_DIR, runMigrations } from './migrate';

// The migration runner guard (EXE29, TKT-26 quality review minor 4, follow-up 2). The `user` rebuild in
// 0029 (DROP TABLE `user` after copying it) is safe only while foreign keys are OFF: with them on, the
// DROP would cascade-delete every session and account (ON DELETE CASCADE) or fail on the agreements'
// references. libSQL's client.migrate() turns foreign keys off before its BEGIN and on again after, so
// `runMigrations` (src/lib/db/migrate.ts) is the only supported runner; `drizzle-kit migrate` is not
// (docs/exec/migrations.md).

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

describe('runMigrations', () => {
  it('applies every migration, 0029 included, with foreign_keys=OFF, and turns them back on afterwards', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'udgam-runner-'));
    try {
      // The committed migrations plus one probe migration after them, in the same batch as the rebuild:
      // it records the foreign_keys setting it runs under.
      const folder = join(dir, 'migrations');
      cpSync(MIGRATIONS_DIR, folder, { recursive: true });
      const journalPath = join(folder, 'meta', '_journal.json');
      const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[] };
      const last = journal.entries.at(-1)!;
      expect(journal.entries.some((e) => e.tag === '0029_processing')).toBe(true);
      const tag = `${String(last.idx + 1).padStart(4, '0')}_fk_probe`;
      journal.entries.push({ idx: last.idx + 1, version: last.version, when: last.when + 1, tag, breakpoints: true });
      writeFileSync(journalPath, JSON.stringify(journal));
      writeFileSync(join(folder, `${tag}.sql`), 'CREATE TABLE `fk_probe` AS SELECT `foreign_keys` AS `fk` FROM pragma_foreign_keys;');

      const { db, client, ready } = createDb(`file:${join(dir, 'r.db')}`);
      await ready;
      try {
        expect((await client.execute('PRAGMA foreign_keys')).rows[0]![0]).toBe(1); // the app's connections run with them on
        await runMigrations(db, folder);
        expect((await client.execute('SELECT fk FROM fk_probe')).rows.map((r) => Number(r.fk))).toEqual([0]);
        expect((await client.execute('PRAGMA foreign_keys')).rows[0]![0]).toBe(1);
        expect(Number((await client.execute('SELECT COUNT(*) AS n FROM __drizzle_migrations')).rows[0]!.n)).toBe(journal.entries.length);
      } finally {
        client.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is the only supported runner: no script, workflow or image applies migrations with drizzle-kit', () => {
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['db:migrate']).toBe('tsx src/lib/db/migrate.ts');
    const banned = /drizzle-kit\s+(migrate|push)/;
    for (const [name, cmd] of Object.entries(pkg.scripts)) expect(cmd, `package.json script ${name}`).not.toMatch(banned);

    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else files.push(p);
      }
    };
    for (const d of ['scripts', '.github']) {
      try {
        walk(join(REPO, d));
      } catch {
        // absent directory: nothing to check
      }
    }
    for (const f of readdirSync(REPO)) if (/^(Dockerfile|docker-compose|compose|entrypoint)/i.test(f)) files.push(join(REPO, f));
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(banned);
  });
});
