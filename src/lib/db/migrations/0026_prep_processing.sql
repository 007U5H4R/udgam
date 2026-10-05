-- Prepare the `user` rebuild of the next migration (TKT-26, TSK-26.3: the processor role, D9). Custom.
-- Extending `user_role_check` needs a table rebuild, which drizzle-kit generates as CREATE __new_user →
-- copy → DROP user → RENAME. The RENAME re-parses every trigger in the schema and fails while a trigger
-- of another table names `user` (0009's agent foreign-key triggers: "error in trigger
-- devices_agent_fk_insert: no such table: main.user"). They are dropped here and recreated unchanged, with
-- 0009's and 0016's triggers on `user` itself (which the DROP removes), right after the rebuild in
-- *_guards_processing.sql. All three migrations run in one transaction with foreign keys off (libSQL's
-- migrate), so no capture or phone can be written in between. Idempotent.

DROP TRIGGER IF EXISTS `devices_agent_fk_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `devices_agent_fk_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `harvest_events_agent_fk_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `harvest_events_agent_fk_update`;
