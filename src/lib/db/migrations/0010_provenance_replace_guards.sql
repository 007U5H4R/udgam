-- Every anchored provenance table refuses INSERT OR REPLACE and DELETE (technical-plan §4.2, S8, TP14;
-- TKT-19 hardening, TASK-15 re-review R1). Same pattern as 0008_batch_replace_guards, which already covers
-- ledger_entries, ledger_checkpoints, batches, batch_events and custody_transfers. attestations and
-- admin_overrides do not exist yet: TKT-13 and TKT-12 must add the same two guards with their tables.
--
-- INSERT OR REPLACE (and REPLACE) resolves a key conflict by deleting the old row, and with
-- recursive_triggers off (SQLite's default) that implicit delete fires no DELETE trigger and no UPDATE
-- trigger. So it got around the frozen-fact guards of 0008 (a batched event's cherry_kg, a plot's crop)
-- and the anchor itself. A BEFORE INSERT trigger runs before the conflict is resolved: these abort
-- whenever the new row's primary key or any unique key already exists. None of these tables is ever
-- upserted, so ON CONFLICT DO UPDATE is refused too. Provenance rows are never deleted by the app (a
-- failed capture deletes media files, never rows); a refused DELETE keeps anchor and row in step.
-- Messages on keyed tables keep "UNIQUE", since a plain duplicate insert now stops here first.
-- Idempotent, self-contained.

CREATE TRIGGER IF NOT EXISTS `plots_no_replace` BEFORE INSERT ON `plots`
WHEN EXISTS (SELECT 1 FROM `plots` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: plot already exists: plots are edited, never replaced');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `plots_no_delete` BEFORE DELETE ON `plots`
BEGIN
  SELECT RAISE(ABORT, 'plots are never deleted');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `devices_no_replace` BEFORE INSERT ON `devices`
WHEN EXISTS (SELECT 1 FROM `devices` WHERE `id` = NEW.`id` OR `key_thumbprint` = NEW.`key_thumbprint`)
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: device already exists (id or key_thumbprint): devices are never replaced');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `devices_no_delete` BEFORE DELETE ON `devices`
BEGIN
  SELECT RAISE(ABORT, 'devices are never deleted (revocation sets revoked_at)');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `harvest_events_no_replace` BEFORE INSERT ON `harvest_events`
WHEN EXISTS (SELECT 1 FROM `harvest_events` WHERE `id` = NEW.`id` OR `payload_hash` = NEW.`payload_hash`)
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: harvest event already exists (id or payload_hash): events are never replaced');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `harvest_events_no_delete` BEFORE DELETE ON `harvest_events`
BEGIN
  SELECT RAISE(ABORT, 'harvest events are never deleted');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `verification_runs_no_replace` BEFORE INSERT ON `verification_runs`
WHEN EXISTS (SELECT 1 FROM `verification_runs` WHERE `id` = NEW.`id` OR (`event_id` = NEW.`event_id` AND `run_no` = NEW.`run_no`))
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: verification run already exists (id or event_id, run_no): runs are never replaced');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `verification_runs_no_delete` BEFORE DELETE ON `verification_runs`
BEGIN
  SELECT RAISE(ABORT, 'verification runs are never deleted');
END;
