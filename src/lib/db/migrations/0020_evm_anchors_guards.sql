-- evm_anchors invariants enforced by the database (technical-plan TSK-24.5, TKT-24). Custom migration:
-- drizzle-kit does not model triggers. The adapter (src/lib/ledger/evm/adapter.ts) already behaves this
-- way; these hold for any writer, including raw SQL (src/lib/ledger/evm/anchors.int.test.ts).
-- Self-contained and idempotent. Same no-replace / no-delete pattern as 0010/0015/0016/0018.

-- A row starts pending: an anchor is claimed only by updating a pending row with its transaction.
CREATE TRIGGER IF NOT EXISTS `evm_anchors_insert_pending` BEFORE INSERT ON `evm_anchors`
WHEN NEW.`status` IS NOT 'pending' OR NEW.`tx_hash` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'evm anchors are inserted pending, without a transaction');
END;
--> statement-breakpoint
-- INSERT OR REPLACE resolves a key conflict by deleting the old row without firing DELETE or UPDATE
-- triggers; a BEFORE INSERT trigger runs before the conflict is resolved, so refuse any existing seq.
-- The message keeps "UNIQUE", since a plain duplicate insert now stops here first.
CREATE TRIGGER IF NOT EXISTS `evm_anchors_no_replace` BEFORE INSERT ON `evm_anchors`
WHEN EXISTS (SELECT 1 FROM `evm_anchors` WHERE `seq` = NEW.`seq`)
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: evm anchor already exists for this seq: anchors are never replaced');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `evm_anchors_no_delete` BEFORE DELETE ON `evm_anchors`
BEGIN
  SELECT RAISE(ABORT, 'evm anchors are never deleted');
END;
--> statement-breakpoint
-- tx_hash is immutable once set: an anchored row (the only status with a tx_hash) never changes again.
CREATE TRIGGER IF NOT EXISTS `evm_anchors_tx_hash_immutable` BEFORE UPDATE ON `evm_anchors`
WHEN OLD.`tx_hash` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'evm anchor is immutable once its tx_hash is set');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `evm_anchors_failed_terminal` BEFORE UPDATE ON `evm_anchors`
WHEN OLD.`status` = 'failed'
BEGIN
  SELECT RAISE(ABORT, 'a failed evm anchor is terminal');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `evm_anchors_seq_fixed` BEFORE UPDATE OF `seq` ON `evm_anchors`
WHEN NEW.`seq` IS NOT OLD.`seq`
BEGIN
  SELECT RAISE(ABORT, 'evm anchor seq is fixed');
END;
