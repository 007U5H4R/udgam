-- The attestations table gets the same provenance guards as the other anchored tables (technical-plan
-- §4.2, S8, TP14; TKT-13; the pattern of 0010_provenance_replace_guards). Custom migration: drizzle-kit
-- does not model triggers. Self-contained and idempotent.
--
-- An attestation is a fact anchored at one moment: an issuer's certificate whose file hash, issuer and
-- validity dates are in the ledger entry. INSERT OR REPLACE resolves a key conflict by deleting the old
-- row without firing DELETE or UPDATE triggers, so a BEFORE INSERT trigger (which runs before the
-- conflict is resolved) refuses any insert whose primary key already exists; ON CONFLICT DO UPDATE is
-- refused with it. The row is never updated (the anchored fields would silently diverge from the ledger)
-- and never deleted (a corrected certificate is a new attestation).

CREATE TRIGGER IF NOT EXISTS `attestations_no_replace` BEFORE INSERT ON `attestations`
WHEN EXISTS (SELECT 1 FROM `attestations` WHERE `id` = NEW.`id`)
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: attestation already exists: attestations are never replaced');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `attestations_no_update` BEFORE UPDATE ON `attestations`
BEGIN
  SELECT RAISE(ABORT, 'attestations are never updated: record a new attestation instead');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `attestations_no_delete` BEFORE DELETE ON `attestations`
BEGIN
  SELECT RAISE(ABORT, 'attestations are never deleted');
END;
