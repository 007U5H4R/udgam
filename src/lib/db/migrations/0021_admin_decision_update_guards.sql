-- Admin decision update guards (TKT-12 fix round 1; technical-plan §4.2, S8, CF-06, EXE16, EXE19).
-- Custom migration: drizzle-kit does not model triggers. Defence in depth for writes the app never makes,
-- so the guards of 0018 cannot be stepped around in two raw statements. Self-contained and idempotent.

-- An admin's decision is final: once an override exists, the event's final verdict is the override's.
-- The override's own AFTER INSERT trigger (admin_overrides_set_final_verdict) sets exactly that value,
-- so it passes; any other value is refused.
CREATE TRIGGER IF NOT EXISTS `harvest_events_decided_frozen` BEFORE UPDATE OF `final_verdict` ON `harvest_events`
WHEN NEW.`final_verdict` IS NOT OLD.`final_verdict`
 AND EXISTS (
   SELECT 1 FROM `admin_overrides` o JOIN `verification_runs` r ON r.`id` = o.`run_id`
    WHERE r.`event_id` = OLD.`id` AND o.`new_verdict` IS NOT NEW.`final_verdict`
 )
BEGIN
  SELECT RAISE(ABORT, 'event was decided by an admin: its final verdict cannot change');
END;
--> statement-breakpoint
-- A verification run is an anchored record: once written, nothing in it changes (a hard fail can't be
-- cleared and then overridden, CF-06). No app path updates a run; a re-run writes a new one.
CREATE TRIGGER IF NOT EXISTS `verification_runs_immutable` BEFORE UPDATE ON `verification_runs`
BEGIN
  SELECT RAISE(ABORT, 'a verification run is frozen once written: runs are immutable');
END;
--> statement-breakpoint
-- A batched event's new run is refused by 0007's verification_runs_not_batched, which names the batch;
-- the decided-event refusal steps aside for it, so the refusal maps to `batched` whatever the trigger order.
DROP TRIGGER IF EXISTS `verification_runs_not_decided`;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `verification_runs_not_decided` BEFORE INSERT ON `verification_runs`
WHEN EXISTS (
  SELECT 1 FROM `admin_overrides` o JOIN `verification_runs` r ON r.`id` = o.`run_id`
   WHERE r.`event_id` = NEW.`event_id`
)
 AND NOT EXISTS (SELECT 1 FROM `batch_events` WHERE `event_id` = NEW.`event_id`)
BEGIN
  SELECT RAISE(ABORT, 'event was decided by an admin: its verdict is final');
END;
--> statement-breakpoint
-- 0018's insert guards, in one trigger so their order is fixed (SQLite does not define the order of
-- several triggers on one event): the run exists; no hard fail (CF-06); not batched (EXE16); the latest
-- run; never a second override (0018's admin_overrides_no_replace, folded in: INSERT OR REPLACE and
-- REPLACE included); and, new here, only a Needs Review run, and a reason with no hidden or control
-- character (EXE19: C0 but the newline, DEL and C1, the soft hyphen, Arabic and Syriac format marks,
-- the Mongolian vowel separator, zero-width and directional marks, line and paragraph separators,
-- bidi embeddings, overrides and isolates, invisible operators, the byte-order mark, interlinear
-- annotation marks). NUL is refused by the app (SQLite text functions stop at it).
DROP TRIGGER IF EXISTS `admin_overrides_no_replace`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `admin_overrides_before_insert`;
--> statement-breakpoint
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
  SELECT RAISE(ABORT, 'UNIQUE: override already exists (id or run_id): overrides are never replaced')
   WHERE EXISTS (SELECT 1 FROM `admin_overrides` WHERE `id` = NEW.`id` OR `run_id` = NEW.`run_id`);
  SELECT RAISE(ABORT, 'only a Needs Review run can be overridden')
   WHERE NOT EXISTS (SELECT 1 FROM `verification_runs` WHERE `id` = NEW.`run_id` AND `verdict` = 'Needs Review');
  SELECT RAISE(ABORT, 'override reason has hidden or control characters')
   WHERE NEW.`reason` GLOB ('*['
     || char(1) || '-' || char(9) || char(11) || '-' || char(31) || char(127) || '-' || char(159) || char(173)
     || char(1536) || '-' || char(1541) || char(1564) || char(1757) || char(1807) || char(2192) || '-' || char(2193) || char(2274) || char(6158)
     || char(8203) || '-' || char(8207) || char(8232) || '-' || char(8238) || char(8288) || '-' || char(8292) || char(8294) || '-' || char(8303)
     || char(65279) || char(65529) || '-' || char(65531)
     || ']*');
END;
