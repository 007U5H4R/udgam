-- Guards against INSERT OR REPLACE and frozen batched facts (technical-plan §4.2, S8, TP14; TKT-14 fix
-- round 1). Custom migration: drizzle-kit does not model triggers.
--
-- INSERT OR REPLACE (and REPLACE) resolves a key conflict by deleting the old row. With
-- recursive_triggers off (SQLite's default) that implicit delete fires no DELETE trigger, so the
-- append-only and lock-after-transfer triggers never saw it. A BEFORE INSERT trigger runs before the
-- conflict is resolved, so these abort whenever the new row's key already exists. Upserts
-- (ON CONFLICT DO UPDATE) are covered by the BEFORE UPDATE triggers already in place.

-- The ledger (§4.2 append-only; migrations 0001 and 0004 guard UPDATE and DELETE). The messages keep
-- "UNIQUE", since a plain duplicate insert now stops here before the key constraint does.
CREATE TRIGGER IF NOT EXISTS `ledger_no_replace` BEFORE INSERT ON `ledger_entries`
WHEN EXISTS (SELECT 1 FROM `ledger_entries` WHERE `seq` = NEW.`seq` OR `entry_hash` = NEW.`entry_hash`)
BEGIN
  SELECT RAISE(ABORT, 'ledger is append-only (UNIQUE seq or entry_hash already exists)');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_checkpoints_no_replace` BEFORE INSERT ON `ledger_checkpoints`
WHEN EXISTS (SELECT 1 FROM `ledger_checkpoints` WHERE `id` = NEW.`id` OR `to_seq` = NEW.`to_seq`)
BEGIN
  SELECT RAISE(ABORT, 'ledger is append-only (UNIQUE id or to_seq already exists)');
END;
--> statement-breakpoint
-- Batches: a batch row is written once (its identity, status and aggregates change only by the guarded UPDATE).
CREATE TRIGGER IF NOT EXISTS `batches_no_replace` BEFORE INSERT ON `batches`
WHEN EXISTS (SELECT 1 FROM `batches` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'batch already exists: batches are never replaced');
END;
--> statement-breakpoint
-- Membership is fixed: an event already in a batch is never re-inserted (a REPLACE would move it).
CREATE TRIGGER IF NOT EXISTS `batch_events_no_replace` BEFORE INSERT ON `batch_events`
WHEN EXISTS (SELECT 1 FROM `batch_events` WHERE `event_id` = NEW.`event_id`)
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE constraint failed: batch_events.event_id (the event is already in a batch)');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `custody_transfers_no_replace` BEFORE INSERT ON `custody_transfers`
WHEN EXISTS (SELECT 1 FROM `custody_transfers` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'custody transfers are append-only');
END;
--> statement-breakpoint
-- In M-001 a batch has exactly one hop, to a buyer organisation (the batch locks with it). Only checked
-- while the batch is open: after the transfer the 0007 trigger already refuses ("not open").
CREATE TRIGGER IF NOT EXISTS `custody_transfers_one_hop_to_buyer` BEFORE INSERT ON `custody_transfers`
WHEN (SELECT `status` FROM `batches` WHERE `id` = NEW.`batch_id`) = 'open'
BEGIN
  SELECT RAISE(ABORT, 'batch already has a custody transfer')
   WHERE EXISTS (SELECT 1 FROM `custody_transfers` WHERE `batch_id` = NEW.`batch_id`);
  SELECT RAISE(ABORT, 'custody transfer must go to a buyer organisation')
   WHERE (SELECT `type` FROM `organisations` WHERE `id` = NEW.`to_org`) IS NOT 'buyer';
END;
--> statement-breakpoint
-- Frozen facts: batch_created anchored each member's capture, kilograms and score. Once an event is in a
-- batch its cherry_kg and final_verdict, its runs' score and verdict, and its plot's crop never change,
-- so the batch aggregates cannot drift from what was anchored. (TKT-12's override path must likewise
-- refuse overrides on batched events; admin_overrides does not exist yet.)
CREATE TRIGGER IF NOT EXISTS `harvest_events_batched_frozen` BEFORE UPDATE OF `cherry_kg`, `final_verdict` ON `harvest_events`
WHEN EXISTS (SELECT 1 FROM `batch_events` WHERE `event_id` = OLD.`id`)
 AND (NEW.`cherry_kg` IS NOT OLD.`cherry_kg` OR NEW.`final_verdict` IS NOT OLD.`final_verdict`)
BEGIN
  SELECT RAISE(ABORT, 'event is in a batch: its kilograms and verdict are frozen');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `verification_runs_batched_frozen` BEFORE UPDATE OF `score`, `verdict`, `event_id` ON `verification_runs`
WHEN EXISTS (SELECT 1 FROM `batch_events` WHERE `event_id` IN (OLD.`event_id`, NEW.`event_id`))
 AND (NEW.`score` IS NOT OLD.`score` OR NEW.`verdict` IS NOT OLD.`verdict` OR NEW.`event_id` IS NOT OLD.`event_id`)
BEGIN
  SELECT RAISE(ABORT, 'event is in a batch: its runs are frozen');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `plots_batched_crop_frozen` BEFORE UPDATE OF `crop` ON `plots`
WHEN NEW.`crop` IS NOT OLD.`crop`
 AND EXISTS (SELECT 1 FROM `batch_events` be JOIN `harvest_events` e ON e.`id` = be.`event_id` WHERE e.`plot_id` = OLD.`id`)
BEGIN
  SELECT RAISE(ABORT, 'plot has events in a batch: its crop is frozen');
END;
