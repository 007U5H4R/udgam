-- The operator path out of a failed EVM anchor (TASK-25 fix round 1; docs/proof-feed.md §13.4). Custom
-- migration: drizzle-kit does not model triggers. A failed anchor stays failed for good, but it may take
-- exactly ONE resolution (reason of 10+ characters plus its time), written by `pnpm ledger:evm:resolve`;
-- after that the row never changes again. Only a failed row can carry a resolution, and rows are
-- inserted without one. Self-contained and idempotent: the 0020 trigger is replaced by name.

DROP TRIGGER IF EXISTS `evm_anchors_failed_terminal`;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `evm_anchors_failed_terminal` BEFORE UPDATE ON `evm_anchors`
WHEN OLD.`status` = 'failed' AND NOT (
  OLD.`resolution` IS NULL AND OLD.`resolved_at` IS NULL
  AND NEW.`resolution` IS NOT NULL AND length(trim(NEW.`resolution`)) >= 10 AND NEW.`resolved_at` IS NOT NULL
  AND NEW.`status` = 'failed' AND NEW.`seq` IS OLD.`seq` AND NEW.`attempts` IS OLD.`attempts`
  AND NEW.`last_error` IS OLD.`last_error` AND NEW.`chain_id` IS OLD.`chain_id` AND NEW.`contract` IS OLD.`contract`
  AND NEW.`tx_hash` IS OLD.`tx_hash` AND NEW.`block_number` IS OLD.`block_number`
)
BEGIN
  SELECT RAISE(ABORT, 'a failed evm anchor is terminal: only its one resolution may be recorded');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `evm_anchors_resolution_failed_only` BEFORE UPDATE ON `evm_anchors`
WHEN OLD.`status` IS NOT 'failed' AND (NEW.`resolution` IS NOT NULL OR NEW.`resolved_at` IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'only a failed evm anchor can be resolved');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `evm_anchors_insert_unresolved` BEFORE INSERT ON `evm_anchors`
WHEN NEW.`resolution` IS NOT NULL OR NEW.`resolved_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'evm anchors are inserted pending, without a resolution');
END;
