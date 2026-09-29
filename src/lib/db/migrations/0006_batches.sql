CREATE TABLE `batch_events` (
	`batch_id` text NOT NULL,
	`event_id` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `harvest_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `batch_events_event_id_unique` ON `batch_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `batch_events_batch_idx` ON `batch_events` (`batch_id`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`crop` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`quantity_kg` real DEFAULT 0 NOT NULL,
	`integrity_score` real,
	`short_hash` text NOT NULL,
	`anchor_seq` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "batches_crop_check" CHECK("batches"."crop" IN ('arabica','robusta')),
	CONSTRAINT "batches_status_check" CHECK("batches"."status" IN ('open','transferred'))
);
--> statement-breakpoint
CREATE INDEX `batches_org_idx` ON `batches` (`org_id`);--> statement-breakpoint
CREATE TABLE `custody_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`from_org` text NOT NULL,
	`to_org` text NOT NULL,
	`admin_id` text NOT NULL,
	`transferred_at` text NOT NULL,
	`signature` text NOT NULL,
	`key_id` text NOT NULL,
	`anchor_seq` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_org`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_org`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`admin_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `custody_transfers_batch_idx` ON `custody_transfers` (`batch_id`);--> statement-breakpoint
CREATE INDEX `custody_transfers_to_org_idx` ON `custody_transfers` (`to_org`);