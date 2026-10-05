-- staged_media refuses INSERT OR REPLACE (TKT-30; the 0010/0015/0016 pattern). Staging the same bytes
-- again is an UPDATE of the existing row's expiry (src/lib/capture/staging.ts), never a replace: REPLACE
-- would delete the row and re-insert it, and ON CONFLICT upserts would hide a writer that skips the
-- per-agent cap. A BEFORE INSERT trigger runs before the conflict is resolved: this one aborts whenever
-- the (sha256, agent_id) key already exists. The message keeps "UNIQUE", since a plain duplicate insert
-- now stops here first. Staged rows are not provenance: they are deleted on expiry and once their capture
-- commits, so there is no delete guard. Idempotent, self-contained.

CREATE TRIGGER IF NOT EXISTS `staged_media_no_replace` BEFORE INSERT ON `staged_media`
WHEN EXISTS (SELECT 1 FROM `staged_media` WHERE `sha256` = NEW.`sha256` AND `agent_id` = NEW.`agent_id`)
BEGIN
  SELECT RAISE(ABORT, 'UNIQUE: staged photo already exists for this agent: refresh its expiry, never replace it');
END;
