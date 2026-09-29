-- Batch invariants enforced by the database (technical-plan §4.2 batch part, S8, TP14, CF-07; TKT-14).
-- Custom migration: drizzle-kit does not model triggers or views. The app's checks are courtesy; these
-- hold for any writer, including raw SQL (TC-059, EVAL-077).

-- The aggregates, defined once so the maintaining trigger and the guard compare the same expression:
-- quantity_kg = Σ cherry_kg of the members; integrity_score = MIN over the members of the score of
-- the run that set their final verdict (each member's latest run). NULL score while there are none.
CREATE VIEW IF NOT EXISTS `batch_aggregates` AS
SELECT
  b.`id` AS `batch_id`,
  (SELECT COALESCE(SUM(e.`cherry_kg`), 0)
     FROM `batch_events` be JOIN `harvest_events` e ON e.`id` = be.`event_id`
    WHERE be.`batch_id` = b.`id`) AS `quantity_kg`,
  (SELECT MIN(r.`score`)
     FROM `batch_events` be JOIN `verification_runs` r ON r.`event_id` = be.`event_id`
    WHERE be.`batch_id` = b.`id`
      AND r.`run_no` = (SELECT MAX(r2.`run_no`) FROM `verification_runs` r2 WHERE r2.`event_id` = be.`event_id`)) AS `integrity_score`
FROM `batches` b;
--> statement-breakpoint
-- A batch is inserted open and empty; its members and then its aggregates follow in the same transaction.
CREATE TRIGGER IF NOT EXISTS `batches_before_insert` BEFORE INSERT ON `batches`
WHEN NEW.`status` IS NOT 'open' OR NEW.`quantity_kg` IS NOT 0 OR NEW.`integrity_score` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'a batch is inserted open and empty');
END;
--> statement-breakpoint
-- Lock after transfer; identity fixed; the single open→transferred change needs its custody row; the
-- aggregate columns can only hold what batch_aggregates says (so only the trigger below writes them).
CREATE TRIGGER IF NOT EXISTS `batches_before_update` BEFORE UPDATE ON `batches`
BEGIN
  SELECT RAISE(ABORT, 'batch is locked after transfer') WHERE OLD.`status` = 'transferred';
  SELECT RAISE(ABORT, 'batch identity cannot change')
   WHERE NEW.`id` IS NOT OLD.`id` OR NEW.`org_id` IS NOT OLD.`org_id` OR NEW.`crop` IS NOT OLD.`crop`
      OR NEW.`short_hash` IS NOT OLD.`short_hash` OR NEW.`anchor_seq` IS NOT OLD.`anchor_seq`
      OR NEW.`created_at` IS NOT OLD.`created_at`;
  SELECT RAISE(ABORT, 'batch transfer needs a custody_transfers row')
   WHERE NEW.`status` = 'transferred' AND NOT EXISTS (SELECT 1 FROM `custody_transfers` WHERE `batch_id` = OLD.`id`);
  SELECT RAISE(ABORT, 'batch quantity_kg and integrity_score are maintained by the database')
   WHERE NEW.`quantity_kg` IS NOT (SELECT `quantity_kg` FROM `batch_aggregates` WHERE `batch_id` = OLD.`id`)
      OR NEW.`integrity_score` IS NOT (SELECT `integrity_score` FROM `batch_aggregates` WHERE `batch_id` = OLD.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `batches_before_delete` BEFORE DELETE ON `batches`
BEGIN
  SELECT RAISE(ABORT, 'batches are never deleted');
END;
--> statement-breakpoint
-- Membership: only an open batch; only a Verified event of the batch's crop and organisation. The
-- event_id UNIQUE constraint keeps an event in at most one batch.
CREATE TRIGGER IF NOT EXISTS `batch_events_before_insert` BEFORE INSERT ON `batch_events`
BEGIN
  SELECT RAISE(ABORT, 'batch not found') WHERE NOT EXISTS (SELECT 1 FROM `batches` WHERE `id` = NEW.`batch_id`);
  SELECT RAISE(ABORT, 'batch is locked after transfer')
   WHERE (SELECT `status` FROM `batches` WHERE `id` = NEW.`batch_id`) IS NOT 'open';
  SELECT RAISE(ABORT, 'batch member is not Verified')
   WHERE (SELECT `final_verdict` FROM `harvest_events` WHERE `id` = NEW.`event_id`) IS NOT 'Verified';
  SELECT RAISE(ABORT, 'batch member crop differs from the batch crop')
   WHERE (SELECT p.`crop` FROM `harvest_events` e JOIN `plots` p ON p.`id` = e.`plot_id` WHERE e.`id` = NEW.`event_id`)
         IS NOT (SELECT `crop` FROM `batches` WHERE `id` = NEW.`batch_id`);
  SELECT RAISE(ABORT, 'batch member belongs to another organisation')
   WHERE (SELECT f.`org_id` FROM `harvest_events` e JOIN `plots` p ON p.`id` = e.`plot_id` JOIN `farmers` f ON f.`id` = p.`farmer_id` WHERE e.`id` = NEW.`event_id`)
         IS NOT (SELECT `org_id` FROM `batches` WHERE `id` = NEW.`batch_id`);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `batch_events_after_insert` AFTER INSERT ON `batch_events`
BEGIN
  UPDATE `batches`
     SET `quantity_kg` = (SELECT `quantity_kg` FROM `batch_aggregates` WHERE `batch_id` = NEW.`batch_id`),
         `integrity_score` = (SELECT `integrity_score` FROM `batch_aggregates` WHERE `batch_id` = NEW.`batch_id`)
   WHERE `id` = NEW.`batch_id`;
END;
--> statement-breakpoint
-- Membership is fixed at creation (the batch_created entry lists it): never removed or moved.
CREATE TRIGGER IF NOT EXISTS `batch_events_before_delete` BEFORE DELETE ON `batch_events`
BEGIN
  SELECT RAISE(ABORT, 'batch is locked after transfer')
   WHERE (SELECT `status` FROM `batches` WHERE `id` = OLD.`batch_id`) = 'transferred';
  SELECT RAISE(ABORT, 'batch membership is fixed at creation');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `batch_events_before_update` BEFORE UPDATE ON `batch_events`
BEGIN
  SELECT RAISE(ABORT, 'batch membership is fixed at creation');
END;
--> statement-breakpoint
-- A batched event's verdict is frozen: a new run would change its final verdict and the batch's score
-- after both were anchored in batch_created.
CREATE TRIGGER IF NOT EXISTS `verification_runs_not_batched` BEFORE INSERT ON `verification_runs`
WHEN EXISTS (SELECT 1 FROM `batch_events` WHERE `event_id` = NEW.`event_id`)
BEGIN
  SELECT RAISE(ABORT, 'event is in a batch: its verdict is frozen');
END;
--> statement-breakpoint
-- Custody: recorded only for an open batch, from the organisation that holds it; append-only.
CREATE TRIGGER IF NOT EXISTS `custody_transfers_before_insert` BEFORE INSERT ON `custody_transfers`
BEGIN
  SELECT RAISE(ABORT, 'custody transfer of a batch that is not open')
   WHERE (SELECT `status` FROM `batches` WHERE `id` = NEW.`batch_id`) IS NOT 'open';
  SELECT RAISE(ABORT, 'custody transfer must come from the organisation that holds the batch')
   WHERE NEW.`from_org` IS NOT (SELECT `org_id` FROM `batches` WHERE `id` = NEW.`batch_id`);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `custody_transfers_no_update` BEFORE UPDATE ON `custody_transfers`
BEGIN
  SELECT RAISE(ABORT, 'custody transfers are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `custody_transfers_no_delete` BEFORE DELETE ON `custody_transfers`
BEGIN
  SELECT RAISE(ABORT, 'custody transfers are append-only');
END;
