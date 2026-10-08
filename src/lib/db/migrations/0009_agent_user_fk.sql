-- devices.agent_id and harvest_events.agent_id reference Better Auth's `user` (TKT-19, carry-forward
-- from TKT-04/05). SQLite cannot add a foreign key to an existing table without rebuilding it, and a
-- rebuild of `harvest_events` breaks on the triggers of other tables that name it (the RENAME step
-- fails with "no such table" unless legacy_alter_table is set, which drizzle's generated rebuild does not
-- do) and would silently drop any trigger declared on it. The same rule is therefore enforced here by
-- triggers with foreign-key semantics (ON DELETE/UPDATE NO ACTION); a null harvest_events.agent_id (a
-- refusal that names no enrolled phone) is allowed, as a nullable foreign key would allow it.
-- Idempotent, self-contained.

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
-- The parent side: a user that a phone or a capture names can be neither deleted nor re-keyed.
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
CREATE INDEX IF NOT EXISTS `devices_agent_idx` ON `devices` (`agent_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `harvest_events_agent_idx` ON `harvest_events` (`agent_id`);
