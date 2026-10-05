# Database migrations: how they run

Read this before TKT-27 (container, deploy) and M-003. The decision behind it is EXE29 in `decisions.md`.

## The only supported runner

Apply migrations with the app's own runner, `src/lib/db/migrate.ts`, and nothing else:

- **At boot:** `src/instrumentation.ts` calls `migrateAtBoot()`.
- **From a shell or the container entrypoint:** `pnpm db:migrate`, which runs `tsx src/lib/db/migrate.ts`.
- **In tests:** `tempDb()` calls `runMigrations`.

**Do not use `drizzle-kit migrate` or `drizzle-kit push` in deploy, CI or by hand.** Use `drizzle-kit` only for `pnpm db:generate`, which writes new migration files.

### Why

`0029_processing.sql` rebuilds the `user` table to add the `processor` role. It copies the table, runs `DROP TABLE user`, and renames the copy. That is safe only while `foreign_keys` is OFF.

- With foreign keys ON, the `DROP` would cascade-delete every `session` and `account` row (`ON DELETE CASCADE`), or fail on the agreements' `created_by` reference.
- The `PRAGMA foreign_keys=OFF/ON` lines that drizzle-kit generated inside 0029 do nothing, because SQLite ignores that pragma inside a transaction.
- `runMigrations` uses drizzle-orm's libSQL migrator, which calls libSQL `client.migrate()`. That call turns foreign keys off before its `BEGIN` and on again afterwards, and it applies every pending migration in one transaction. A failure partway through therefore leaves the database unchanged.
- Other runners, `drizzle-kit migrate` included, give no such guarantee.

### What enforces it

`src/lib/db/migrate.int.test.ts` covers the runner:

- It runs the committed migrations with a probe migration after them, and asserts that the probe ran with `foreign_keys = 0`. Afterwards it asserts that the connection is back to `foreign_keys = 1`.
- It asserts that `db:migrate` is `tsx src/lib/db/migrate.ts`.
- It asserts that nothing applies migrations with `drizzle-kit migrate` or `push`. It checks the `package.json` scripts, `scripts/`, `.github/`, and any Dockerfile, compose or entrypoint file at the repo root.

`tests/integration/processing-invariants.int.test.ts` migrates a populated database from 0027 to the latest migration. It compares the whole `sqlite_master` and every table's rows, allowing only the intended changes.

## Notes on committed migrations

Committed migrations are never edited, comments included, so corrections to them are recorded here.

- **`0032_settlement_batch_once_guards.sql`, line 2:** the comment says "0028's partial unique index". The TKT-26 merge renumbered that migration, so the index (`settlements_one_release_per_batch_idx`) is created by **0031** (`0031_settlement_batch_once.sql`). The SQL is correct; only the comment's number is stale.
- **`0034_processing_step_guards.sql`** (follow-up 2) adds two triggers. It does not replace any trigger from 0030:
  - `custody_transfers_processor_step_required`: a processor hands a batch on only after it has recorded its processing step.
  - `processing_steps_recorder_is_processor`: the user who records a step has role `processor` in the processor organisation that holds the batch.

## Before any future rebuild of `user`

A drizzle-kit table rebuild of `user` (CREATE `__new_user` → copy → `DROP TABLE user` → RENAME, as in 0029) has two trigger traps. 0028's comment names only the 0009 triggers, but 0030 and 0034 have added more since, so use the lists below, not that comment.

- **The RENAME re-parses every trigger in the schema** and fails ("no such table: main.user") while a trigger on another table names `user`. Drop those triggers in a custom migration before the rebuild, as `0028_prep_processing.sql` did.
- **The DROP removes every trigger on `user` itself.**

Recreate both groups unchanged in a custom migration right after the rebuild, as `0030_guards_processing.sql` did. Copy each body from the latest migration that created it, and check the result in `sqlite_master`.

`src/lib/db/user-triggers.int.test.ts` migrates an empty database and fails if either list below differs from the triggers it finds, so a new trigger that reads `user` has to be added here.

#### Triggers on other tables that read `user`

- `devices_agent_fk_insert` (0009, recreated by 0030)
- `devices_agent_fk_update` (0009, recreated by 0030)
- `harvest_events_agent_fk_insert` (0009, recreated by 0030)
- `harvest_events_agent_fk_update` (0009, recreated by 0030)
- `processing_steps_recorder_is_processor` (0034)

#### Triggers on `user` itself

- `user_agent_fk_delete` (0009, recreated by 0030)
- `user_agent_fk_update` (0009, recreated by 0030)
- `user_no_replace_referenced` (0016, recreated by 0030)
