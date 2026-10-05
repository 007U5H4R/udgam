-- The processor hop's two library-only rules, now held by the database too (TKT-26 quality review,
-- minor 2; follow-up 2). Custom migration: drizzle-kit does not model triggers. Additive (no trigger of
-- *_guards_processing.sql is replaced), idempotent and self-contained.
--
-- Each guard fires only where every earlier rule already passed (the sender holds the batch, the
-- recipient is a buyer; the recorder's organisation is the processor that holds the batch), so the
-- refusals of *_guards_processing.sql keep their own words.

-- 1. A processor hands a batch on only after it recorded its processing step (src/lib/processing
--    handOnBatch refuses `no_step` first; this holds for any writer, raw SQL included).
CREATE TRIGGER IF NOT EXISTS `custody_transfers_processor_step_required` BEFORE INSERT ON `custody_transfers`
WHEN (SELECT `type` FROM `organisations` WHERE `id` = NEW.`from_org`) = 'processor'
  AND NEW.`from_org` IS (SELECT c.`to_org` FROM `custody_transfers` c WHERE c.`batch_id` = NEW.`batch_id` ORDER BY c.`anchor_seq` DESC LIMIT 1)
  AND (SELECT `type` FROM `organisations` WHERE `id` = NEW.`to_org`) = 'buyer'
  AND NOT EXISTS (SELECT 1 FROM `processing_steps` WHERE `batch_id` = NEW.`batch_id` AND `processor_org` = NEW.`from_org`)
BEGIN
  SELECT RAISE(ABORT, 'a processor hands a batch on only after its processing step is recorded');
END;
--> statement-breakpoint

-- 2. A processing step is recorded by a user with role `processor` in the processor organisation that
--    holds the batch (the Server Action takes both from the session; this holds for any writer).
CREATE TRIGGER IF NOT EXISTS `processing_steps_recorder_is_processor` BEFORE INSERT ON `processing_steps`
WHEN (SELECT `type` FROM `organisations` WHERE `id` = NEW.`processor_org`) = 'processor'
  AND NEW.`processor_org` IS (SELECT c.`to_org` FROM `custody_transfers` c WHERE c.`batch_id` = NEW.`batch_id` ORDER BY c.`anchor_seq` DESC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM `user` WHERE `id` = NEW.`user_id` AND `org_id` = NEW.`processor_org` AND `role` = 'processor')
BEGIN
  SELECT RAISE(ABORT, 'processing step must be recorded by a processor of the organisation that holds the batch');
END;
