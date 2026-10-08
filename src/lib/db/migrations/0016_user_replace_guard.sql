-- The parent side of 0009's trigger-based foreign keys also refuses REPLACE (TASK-20 fix round 2, review #9;
-- the 0010/0015 pattern). INSERT OR REPLACE (and REPLACE) into `user` that conflicts on `email` with a row
-- of a different id resolves the conflict by deleting that row, and with recursive_triggers off (SQLite's
-- default) the implicit delete fires no DELETE trigger, so 0009's user_agent_fk_delete never saw it and a
-- phone or a capture was left naming a user that no longer exists. A real foreign key would refuse this.
-- A BEFORE INSERT trigger runs before the conflict is resolved: this one aborts when another id holds the
-- new row's email and a phone or a capture names that id. It keeps what a foreign key allows: replacing
-- a row with the same id (the referencing rows still name an existing user), replacing an unreferenced
-- user, and scripts/seed-accounts.ts's ON CONFLICT (id) DO UPDATE (which never deletes). A plain DELETE
-- of a referenced user stays refused by 0009. Idempotent, self-contained.

CREATE TRIGGER IF NOT EXISTS `user_no_replace_referenced` BEFORE INSERT ON `user`
WHEN EXISTS (
  SELECT 1 FROM `user` AS `u`
  WHERE `u`.`email` = NEW.`email` AND `u`.`id` IS NOT NEW.`id`
    AND (EXISTS (SELECT 1 FROM `devices` WHERE `agent_id` = `u`.`id`)
      OR EXISTS (SELECT 1 FROM `harvest_events` WHERE `agent_id` = `u`.`id`))
)
BEGIN
  SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed: user referenced by devices or harvest_events');
END;
