-- Contract-farming invariants enforced by the database (technical-plan TSK-25.4, §4.2, TKT-25). Custom
-- migration: drizzle-kit does not model triggers. Same no-replace / no-delete pattern as 0010/0018/0020,
-- plus the agreement's one-way status machine. The app (src/lib/agreements) already behaves this way;
-- these hold for any writer, including raw SQL (src/lib/agreements/schema.int.test.ts).
-- Self-contained and idempotent.

-- ── agreements ────────────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS `agreements_no_replace` BEFORE INSERT ON `agreements`
WHEN EXISTS (SELECT 1 FROM `agreements` WHERE `id` = NEW.`id` OR `chain_id_hex` = NEW.`chain_id_hex`)
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: agreement already exists (id or chain_id_hex): agreements are never replaced');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `agreements_no_delete` BEFORE DELETE ON `agreements`
BEGIN
  SELECT RAISE(ABORT, 'agreements are never deleted');
END;
--> statement-breakpoint
-- An agreement starts created: funding and closing are later anchored facts.
CREATE TRIGGER IF NOT EXISTS `agreements_insert_created` BEFORE INSERT ON `agreements`
WHEN NEW.`status` IS NOT 'created'
BEGIN
  SELECT RAISE(ABORT, 'agreements are inserted created');
END;
--> statement-breakpoint
-- The terms and the creation record never change.
CREATE TRIGGER IF NOT EXISTS `agreements_terms_fixed` BEFORE UPDATE ON `agreements`
WHEN NEW.`id` IS NOT OLD.`id` OR NEW.`chain_id_hex` IS NOT OLD.`chain_id_hex` OR NEW.`buyer_org` IS NOT OLD.`buyer_org`
  OR NEW.`fpo_org` IS NOT OLD.`fpo_org` OR NEW.`crop` IS NOT OLD.`crop` OR NEW.`agreed_kg` IS NOT OLD.`agreed_kg`
  OR NEW.`min_grade` IS NOT OLD.`min_grade` OR NEW.`amount_paise` IS NOT OLD.`amount_paise` OR NEW.`deadline` IS NOT OLD.`deadline`
  OR NEW.`created_by` IS NOT OLD.`created_by` OR NEW.`created_at` IS NOT OLD.`created_at`
  OR NEW.`created_tx_hash` IS NOT OLD.`created_tx_hash` OR NEW.`anchor_seq` IS NOT OLD.`anchor_seq`
BEGIN
  SELECT RAISE(ABORT, 'agreement terms are fixed once created');
END;
--> statement-breakpoint
-- Once set, the funding and closing records never change.
CREATE TRIGGER IF NOT EXISTS `agreements_steps_fixed` BEFORE UPDATE ON `agreements`
WHEN (OLD.`funded_anchor_seq` IS NOT NULL AND (NEW.`funded_anchor_seq` IS NOT OLD.`funded_anchor_seq` OR NEW.`funded_at` IS NOT OLD.`funded_at` OR NEW.`funded_tx_hash` IS NOT OLD.`funded_tx_hash`))
  OR (OLD.`closed_anchor_seq` IS NOT NULL AND (NEW.`closed_anchor_seq` IS NOT OLD.`closed_anchor_seq` OR NEW.`closed_at` IS NOT OLD.`closed_at` OR NEW.`closed_tx_hash` IS NOT OLD.`closed_tx_hash`))
BEGIN
  SELECT RAISE(ABORT, 'agreement funding and closing records are fixed once set');
END;
--> statement-breakpoint
-- One-way status machine: created → funded → settled | refunded. Settled needs a released settlement;
-- the CHECK constraints tie each status to its anchor columns.
CREATE TRIGGER IF NOT EXISTS `agreements_status_flow` BEFORE UPDATE OF `status` ON `agreements`
WHEN NEW.`status` IS NOT OLD.`status` AND NOT (
     (OLD.`status` = 'created' AND NEW.`status` = 'funded')
  OR (OLD.`status` = 'funded' AND NEW.`status` = 'refunded')
  OR (OLD.`status` = 'funded' AND NEW.`status` = 'settled'
      AND EXISTS (SELECT 1 FROM `settlements` s WHERE s.`agreement_id` = OLD.`id` AND s.`outcome` = 'released'))
)
BEGIN
  SELECT RAISE(ABORT, 'agreement status moves only created -> funded -> settled | refunded');
END;
--> statement-breakpoint

-- ── quality_attestations ──────────────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS `quality_attestations_no_replace` BEFORE INSERT ON `quality_attestations`
WHEN EXISTS (SELECT 1 FROM `quality_attestations` WHERE `id` = NEW.`id` OR (`agreement_id` = NEW.`agreement_id` AND `batch_id` = NEW.`batch_id`))
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: a grade already exists for this agreement and batch: grades are never replaced');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `quality_attestations_no_update` BEFORE UPDATE ON `quality_attestations`
BEGIN
  SELECT RAISE(ABORT, 'quality attestations are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `quality_attestations_no_delete` BEFORE DELETE ON `quality_attestations`
BEGIN
  SELECT RAISE(ABORT, 'quality attestations are never deleted');
END;
--> statement-breakpoint
-- A grade is for a batch delivered under a funded agreement: the buyer org signs, the batch is the FPO's,
-- of the agreed crop, and has been handed to the buyer.
CREATE TRIGGER IF NOT EXISTS `quality_attestations_delivered_batch` BEFORE INSERT ON `quality_attestations`
WHEN NOT EXISTS (
  SELECT 1 FROM `agreements` a JOIN `batches` b ON b.`id` = NEW.`batch_id`
   WHERE a.`id` = NEW.`agreement_id` AND a.`status` = 'funded' AND a.`buyer_org` = NEW.`signer_org`
     AND b.`org_id` = a.`fpo_org` AND b.`crop` = a.`crop`
     AND EXISTS (SELECT 1 FROM `custody_transfers` c WHERE c.`batch_id` = b.`id` AND c.`to_org` = a.`buyer_org`)
)
BEGIN
  SELECT RAISE(ABORT, 'a grade needs a funded agreement and a batch delivered to its buyer');
END;
--> statement-breakpoint

-- ── settlements ───────────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS `settlements_no_replace` BEFORE INSERT ON `settlements`
WHEN EXISTS (SELECT 1 FROM `settlements` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: settlement already exists: settlements are never replaced');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `settlements_no_update` BEFORE UPDATE ON `settlements`
BEGIN
  SELECT RAISE(ABORT, 'settlements are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `settlements_no_delete` BEFORE DELETE ON `settlements`
BEGIN
  SELECT RAISE(ABORT, 'settlements are never deleted');
END;
--> statement-breakpoint
-- A settlement judges a funded agreement with the signed grade for that same batch; released means
-- every condition held (no reasons, all Verified), and anything else names at least one reason.
CREATE TRIGGER IF NOT EXISTS `settlements_consistent` BEFORE INSERT ON `settlements`
WHEN NOT EXISTS (SELECT 1 FROM `agreements` a WHERE a.`id` = NEW.`agreement_id` AND a.`status` = 'funded')
  OR NOT EXISTS (SELECT 1 FROM `quality_attestations` q WHERE q.`id` = NEW.`attestation_id` AND q.`agreement_id` = NEW.`agreement_id`
                   AND q.`batch_id` = NEW.`batch_id` AND q.`grade` = NEW.`grade`)
  OR json_valid(NEW.`reasons`) = 0 OR json_type(NEW.`reasons`) IS NOT 'array'
  OR (NEW.`outcome` = 'released' AND (json_array_length(NEW.`reasons`) <> 0 OR NEW.`all_verified` <> 1))
  OR (NEW.`outcome` = 'not_released' AND json_array_length(NEW.`reasons`) = 0)
BEGIN
  SELECT RAISE(ABORT, 'a settlement needs a funded agreement, its signed grade and reasons that match the outcome');
END;
