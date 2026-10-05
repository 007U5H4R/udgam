-- A delivered batch pays out once, across every agreement (TKT-25 review fix, TASK-26). Custom migration:
-- drizzle-kit does not model triggers. 0028's partial unique index refuses a second released settlement
-- for a batch; this trigger keeps a grade off a batch already released under another agreement, the same
-- rule as the app's deliveredBatchIds. It replaces 0027's trigger of the same name (that migration stays
-- as committed). Self-contained and idempotent.
DROP TRIGGER IF EXISTS `quality_attestations_delivered_batch`;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `quality_attestations_delivered_batch` BEFORE INSERT ON `quality_attestations`
WHEN NOT EXISTS (
  SELECT 1 FROM `agreements` a JOIN `batches` b ON b.`id` = NEW.`batch_id`
   WHERE a.`id` = NEW.`agreement_id` AND a.`status` = 'funded' AND a.`buyer_org` = NEW.`signer_org`
     AND b.`org_id` = a.`fpo_org` AND b.`crop` = a.`crop`
     AND EXISTS (SELECT 1 FROM `custody_transfers` c WHERE c.`batch_id` = b.`id` AND c.`to_org` = a.`buyer_org`)
     AND NOT EXISTS (SELECT 1 FROM `settlements` s WHERE s.`batch_id` = b.`id` AND s.`outcome` = 'released' AND s.`agreement_id` <> a.`id`)
)
BEGIN
  SELECT RAISE(ABORT, 'a grade needs a funded agreement and a batch delivered to its buyer, not already paid out under another agreement');
END;
