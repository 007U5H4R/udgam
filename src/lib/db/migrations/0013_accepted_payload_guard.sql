-- harvest_events' REPLACE guard follows its new unique keys (TKT-09 idempotency, EV15/TP7; 0010's pattern).
-- payload_hash is now unique among ACCEPTED events only (harvest_events_accepted_payload_hash_unique), and
-- a boundary refusal is unique per (payload_hash, boundary_reason) among REJECTED events: a stored refusal
-- (an unverified signature, an unknown key, an un-assigned plot, mismatched bytes) never blocks a later
-- genuine capture of the same signed payload, while one payload is still accepted at most once and each
-- distinct refusal of it is anchored once.
-- 0010's harvest_events_no_replace aborted on ANY existing row with the same payload_hash, which would keep
-- the old stickiness. It is replaced by a guard that aborts whenever the new row's primary key or either
-- unique key already exists, so INSERT OR REPLACE (which would silently delete the old row) and
-- ON CONFLICT upserts stay refused on every key. The message keeps "UNIQUE". Idempotent, self-contained.

DROP TRIGGER IF EXISTS `harvest_events_no_replace`;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `harvest_events_no_replace` BEFORE INSERT ON `harvest_events`
WHEN EXISTS (
  SELECT 1 FROM `harvest_events`
  WHERE `id` = NEW.`id`
     OR (NEW.`boundary_status` = 'accepted' AND `boundary_status` = 'accepted' AND `payload_hash` = NEW.`payload_hash`)
     OR (NEW.`boundary_status` = 'rejected' AND `boundary_status` = 'rejected' AND `payload_hash` = NEW.`payload_hash`
         AND `boundary_reason` IS NEW.`boundary_reason`)
)
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: harvest event already exists (id, accepted payload_hash, or payload_hash with the same refusal): events are never replaced');
END;
