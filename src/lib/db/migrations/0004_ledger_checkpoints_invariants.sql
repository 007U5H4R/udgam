-- Checkpoint invariants and ledger lookup indexes (technical-plan §4.2, §8.2, §8.3; TKT-15).
-- Custom migration: drizzle-kit does not model triggers or expression indexes.

-- Checkpoints are append-only, like the entries they seal.
CREATE TRIGGER IF NOT EXISTS `ledger_checkpoints_no_update` BEFORE UPDATE ON `ledger_checkpoints`
BEGIN
  SELECT RAISE(ABORT, 'ledger is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_checkpoints_no_delete` BEFORE DELETE ON `ledger_checkpoints`
BEGIN
  SELECT RAISE(ABORT, 'ledger is append-only');
END;
--> statement-breakpoint
-- The provenance closure of a batch (evaluation-plan §4.6) is found from the entries' own payloads:
-- by kind plus the batch, event, plot or device id the payload names.
CREATE INDEX IF NOT EXISTS `ledger_entries_batch_idx` ON `ledger_entries` (`kind`, json_extract(`payload`, '$.batchId'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ledger_entries_event_idx` ON `ledger_entries` (`kind`, json_extract(`payload`, '$.eventId'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ledger_entries_plot_idx` ON `ledger_entries` (`kind`, json_extract(`payload`, '$.plotId'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ledger_entries_device_idx` ON `ledger_entries` (`kind`, json_extract(`payload`, '$.deviceId'));
