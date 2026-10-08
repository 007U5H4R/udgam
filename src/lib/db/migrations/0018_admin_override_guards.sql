-- Admin override invariants enforced by the database (technical-plan §4.2, S8, TP14, CF-06; TKT-12).
-- Custom migration: drizzle-kit does not model triggers. The app's checks (src/lib/review/override.ts)
-- are courtesy; these hold for any writer, including raw SQL (TC-056, EVAL-076). Self-contained and
-- idempotent.

-- What may be overridden: only the latest run of an event that is in no batch, and never a run whose
-- checks hold a hard fail (a hard fail always means Not accepted and can't be overruled, CF-06). A batched
-- event's verdict is frozen in its batch_created entry (EXE16; 0008's harvest_events_batched_frozen would
-- refuse the verdict change anyway, this names the reason first).
CREATE TRIGGER IF NOT EXISTS `admin_overrides_before_insert` BEFORE INSERT ON `admin_overrides`
BEGIN
  SELECT RAISE(ABORT, 'verification run not found')
   WHERE NOT EXISTS (SELECT 1 FROM `verification_runs` WHERE `id` = NEW.`run_id`);
  SELECT RAISE(ABORT, 'a hard-failed run cannot be overridden')
   WHERE EXISTS (
     SELECT 1 FROM `verification_runs` r, json_each(r.`checks`) c
      WHERE r.`id` = NEW.`run_id` AND json_extract(c.`value`, '$.hardFail') IS 1
   );
  SELECT RAISE(ABORT, 'event is in a batch: its verdict is frozen')
   WHERE EXISTS (
     SELECT 1 FROM `batch_events` be JOIN `verification_runs` r ON r.`event_id` = be.`event_id`
      WHERE r.`id` = NEW.`run_id`
   );
  SELECT RAISE(ABORT, 'only the latest run of an event can be overridden')
   WHERE EXISTS (
     SELECT 1 FROM `verification_runs` r JOIN `verification_runs` later ON later.`event_id` = r.`event_id` AND later.`run_no` > r.`run_no`
      WHERE r.`id` = NEW.`run_id`
   );
END;
--> statement-breakpoint
-- An override sets the event's final verdict (as a new run does, 0001's runs_set_final_verdict).
CREATE TRIGGER IF NOT EXISTS `admin_overrides_set_final_verdict` AFTER INSERT ON `admin_overrides`
BEGIN
  UPDATE `harvest_events` SET `final_verdict` = NEW.`new_verdict`
   WHERE `id` = (SELECT `event_id` FROM `verification_runs` WHERE `id` = NEW.`run_id`);
END;
--> statement-breakpoint
-- An admin's decision is final: a later verification run would silently replace the decided verdict.
CREATE TRIGGER IF NOT EXISTS `verification_runs_not_decided` BEFORE INSERT ON `verification_runs`
WHEN EXISTS (
  SELECT 1 FROM `admin_overrides` o JOIN `verification_runs` r ON r.`id` = o.`run_id`
   WHERE r.`event_id` = NEW.`event_id`
)
BEGIN
  SELECT RAISE(ABORT, 'event was decided by an admin: its verdict is final');
END;
--> statement-breakpoint
-- Append-only, in the pattern of 0010/0015/0016: INSERT OR REPLACE (and REPLACE) resolves a key conflict
-- by deleting the old row without firing DELETE or UPDATE triggers, so a BEFORE INSERT trigger (which runs
-- before the conflict is resolved) refuses any insert whose primary key or run_id already exists. The
-- message keeps "UNIQUE", since a plain second override of a run now stops here first.
CREATE TRIGGER IF NOT EXISTS `admin_overrides_no_replace` BEFORE INSERT ON `admin_overrides`
WHEN EXISTS (SELECT 1 FROM `admin_overrides` WHERE `id` = NEW.`id` OR `run_id` = NEW.`run_id`)
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: override already exists (id or run_id): overrides are never replaced');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `admin_overrides_no_update` BEFORE UPDATE ON `admin_overrides`
BEGIN
  SELECT RAISE(ABORT, 'admin overrides are never updated');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `admin_overrides_no_delete` BEFORE DELETE ON `admin_overrides`
BEGIN
  SELECT RAISE(ABORT, 'admin overrides are never deleted');
END;
