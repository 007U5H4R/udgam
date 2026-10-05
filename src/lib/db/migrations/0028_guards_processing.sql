-- The processor hop (TKT-26, TSK-26.3, F18, D9): custody FPO → processor → buyer, signed and anchored
-- processing steps, and the `user` triggers restored after the rebuild of *_processing.sql. Custom
-- migration: drizzle-kit does not model triggers. Idempotent and self-contained.

-- 1. The `user` triggers, recreated exactly as 0009 and 0016 wrote them (the rebuild dropped the ones on
--    `user`; *_prep_processing.sql dropped the ones on devices and harvest_events that name `user`).
CREATE TRIGGER IF NOT EXISTS `devices_agent_fk_insert` BEFORE INSERT ON `devices`
WHEN NOT EXISTS (SELECT 1 FROM `user` WHERE `id` = NEW.`agent_id`)
BEGIN
  SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed: devices.agent_id');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `devices_agent_fk_update` BEFORE UPDATE OF `agent_id` ON `devices`
WHEN NOT EXISTS (SELECT 1 FROM `user` WHERE `id` = NEW.`agent_id`)
BEGIN
  SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed: devices.agent_id');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `harvest_events_agent_fk_insert` BEFORE INSERT ON `harvest_events`
WHEN NEW.`agent_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `user` WHERE `id` = NEW.`agent_id`)
BEGIN
  SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed: harvest_events.agent_id');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `harvest_events_agent_fk_update` BEFORE UPDATE OF `agent_id` ON `harvest_events`
WHEN NEW.`agent_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `user` WHERE `id` = NEW.`agent_id`)
BEGIN
  SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed: harvest_events.agent_id');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `user_agent_fk_delete` BEFORE DELETE ON `user`
WHEN EXISTS (SELECT 1 FROM `devices` WHERE `agent_id` = OLD.`id`)
  OR EXISTS (SELECT 1 FROM `harvest_events` WHERE `agent_id` = OLD.`id`)
BEGIN
  SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed: user referenced by devices or harvest_events');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `user_agent_fk_update` BEFORE UPDATE OF `id` ON `user`
WHEN NEW.`id` IS NOT OLD.`id` AND (
  EXISTS (SELECT 1 FROM `devices` WHERE `agent_id` = OLD.`id`)
  OR EXISTS (SELECT 1 FROM `harvest_events` WHERE `agent_id` = OLD.`id`))
BEGIN
  SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed: user referenced by devices or harvest_events');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `user_no_replace_referenced` BEFORE INSERT ON `user`
WHEN EXISTS (
  SELECT 1 FROM `user` AS `u`
  WHERE `u`.`email` = NEW.`email` AND `u`.`id` IS NOT NEW.`id`
    AND (EXISTS (SELECT 1 FROM `devices` WHERE `agent_id` = `u`.`id`)
      OR EXISTS (SELECT 1 FROM `harvest_events` WHERE `agent_id` = `u`.`id`))
)
BEGIN
  SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed: user referenced by devices or harvest_events');
END;
--> statement-breakpoint

-- 2. Custody with a processor hop (replaces 0007's custody_transfers_before_insert and 0008's
--    custody_transfers_one_hop_to_buyer). The holder of a batch is the `to_org` of its latest custody row,
--    or its FPO while it has none. Rules, in order:
--    - an open batch, or a batch a processor holds, can be handed on; any other transferred batch is
--      locked ("not open", as before);
--    - an open batch has one first hop (a second row while it is still open is refused);
--    - only the holder hands it on;
--    - the first hop goes to a buyer or a processor organisation;
--    - a processor hands it on to a buyer organisation only (FPO → processor → buyer).
--    The batch row itself stays locked after its first hop (0007): later hops add custody rows only.
DROP TRIGGER IF EXISTS `custody_transfers_one_hop_to_buyer`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `custody_transfers_before_insert`;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `custody_transfers_before_insert` BEFORE INSERT ON `custody_transfers`
BEGIN
  SELECT RAISE(ABORT, 'custody transfer of a batch that is not open')
   WHERE (SELECT `status` FROM `batches` WHERE `id` = NEW.`batch_id`) IS NOT 'open'
     AND (SELECT o.`type` FROM `custody_transfers` c JOIN `organisations` o ON o.`id` = c.`to_org`
           WHERE c.`batch_id` = NEW.`batch_id` ORDER BY c.`anchor_seq` DESC LIMIT 1) IS NOT 'processor';
  SELECT RAISE(ABORT, 'batch already has a custody transfer')
   WHERE (SELECT `status` FROM `batches` WHERE `id` = NEW.`batch_id`) = 'open'
     AND EXISTS (SELECT 1 FROM `custody_transfers` WHERE `batch_id` = NEW.`batch_id`);
  SELECT RAISE(ABORT, 'custody transfer must come from the organisation that holds the batch')
   WHERE NEW.`from_org` IS NOT COALESCE(
     (SELECT c.`to_org` FROM `custody_transfers` c WHERE c.`batch_id` = NEW.`batch_id` ORDER BY c.`anchor_seq` DESC LIMIT 1),
     (SELECT `org_id` FROM `batches` WHERE `id` = NEW.`batch_id`));
  SELECT RAISE(ABORT, 'custody transfer must go to a buyer organisation or a processor')
   WHERE (SELECT `status` FROM `batches` WHERE `id` = NEW.`batch_id`) = 'open'
     AND COALESCE((SELECT `type` FROM `organisations` WHERE `id` = NEW.`to_org`), '') NOT IN ('buyer', 'processor');
  SELECT RAISE(ABORT, 'a processor hands a batch on to a buyer organisation')
   WHERE (SELECT `status` FROM `batches` WHERE `id` = NEW.`batch_id`) IS NOT 'open'
     AND (SELECT `type` FROM `organisations` WHERE `id` = NEW.`to_org`) IS NOT 'buyer';
END;
--> statement-breakpoint

-- 3. Processing steps: recorded only by a processor organisation while it holds the batch, anchored as a
--    processing_step ledger entry, and append-only (REPLACE included, the 0008 pattern).
CREATE TRIGGER IF NOT EXISTS `processing_steps_before_insert` BEFORE INSERT ON `processing_steps`
BEGIN
  SELECT RAISE(ABORT, 'processing steps are append-only')
   WHERE EXISTS (SELECT 1 FROM `processing_steps` WHERE `id` = NEW.`id`);
  SELECT RAISE(ABORT, 'processing step must be anchored as a processing_step ledger entry')
   WHERE (SELECT `kind` FROM `ledger_entries` WHERE `seq` = NEW.`anchor_seq`) IS NOT 'processing_step';
  SELECT RAISE(ABORT, 'processing step must be recorded by a processor organisation')
   WHERE (SELECT `type` FROM `organisations` WHERE `id` = NEW.`processor_org`) IS NOT 'processor';
  SELECT RAISE(ABORT, 'processing step must be recorded by the organisation that holds the batch')
   WHERE NEW.`processor_org` IS NOT
     (SELECT c.`to_org` FROM `custody_transfers` c WHERE c.`batch_id` = NEW.`batch_id` ORDER BY c.`anchor_seq` DESC LIMIT 1);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `processing_steps_no_update` BEFORE UPDATE ON `processing_steps`
BEGIN
  SELECT RAISE(ABORT, 'processing steps are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `processing_steps_no_delete` BEFORE DELETE ON `processing_steps`
BEGIN
  SELECT RAISE(ABORT, 'processing steps are append-only');
END;
