CREATE TABLE `processing_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`processor_org` text NOT NULL,
	`user_id` text NOT NULL,
	`process` text NOT NULL,
	`input_kg` real NOT NULL,
	`output_kg` real NOT NULL,
	`ratio` real NOT NULL,
	`band_min` real NOT NULL,
	`band_max` real NOT NULL,
	`status` text NOT NULL,
	`evidence` text NOT NULL,
	`config_version` text NOT NULL,
	`recorded_at` text NOT NULL,
	`signature` text NOT NULL,
	`key_id` text NOT NULL,
	`anchor_seq` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`processor_org`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "processing_steps_process_check" CHECK("processing_steps"."process" IN ('pulping','drying','hulling_parchment','hulling_dry_cherry')),
	CONSTRAINT "processing_steps_status_check" CHECK("processing_steps"."status" IN ('ok','flag')),
	CONSTRAINT "processing_steps_kg_check" CHECK("processing_steps"."input_kg" > 0 AND "processing_steps"."output_kg" > 0),
	CONSTRAINT "processing_steps_band_check" CHECK("processing_steps"."band_min" < "processing_steps"."band_max")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `processing_steps_batch_org_uq` ON `processing_steps` (`batch_id`,`processor_org`);--> statement-breakpoint
CREATE INDEX `processing_steps_org_idx` ON `processing_steps` (`processor_org`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`role` text NOT NULL,
	`org_id` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "user_role_check" CHECK("__new_user"."role" IN ('agent','admin','buyer','processor'))
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "name", "email", "email_verified", "image", "created_at", "updated_at", "role", "org_id") SELECT "id", "name", "email", "email_verified", "image", "created_at", "updated_at", "role", "org_id" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `user_org_idx` ON `user` (`org_id`);