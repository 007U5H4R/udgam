-- Invariants enforced by the database (technical-plan §4.2, TP14). Custom migration: drizzle-kit
-- does not model triggers. Later tickets add their own (checkpoints, overrides, batches).

-- The ledger is append-only.
CREATE TRIGGER `ledger_no_update` BEFORE UPDATE ON `ledger_entries`
BEGIN
  SELECT RAISE(ABORT, 'ledger is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `ledger_no_delete` BEFORE DELETE ON `ledger_entries`
BEGIN
  SELECT RAISE(ABORT, 'ledger is append-only');
END;
--> statement-breakpoint
-- A new verification run sets the event's final verdict (an admin override does the same, TKT-12).
CREATE TRIGGER `runs_set_final_verdict` AFTER INSERT ON `verification_runs`
BEGIN
  UPDATE `harvest_events` SET `final_verdict` = NEW.`verdict` WHERE `id` = NEW.`event_id`;
END;
