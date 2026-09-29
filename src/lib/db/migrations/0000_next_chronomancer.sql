CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`public_key_jwk` text NOT NULL,
	`key_thumbprint` text NOT NULL,
	`enrolled_at` text NOT NULL,
	`revoked_at` text,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`last_event_hash` text,
	`anchor_seq` integer NOT NULL,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_key_thumbprint_unique` ON `devices` (`key_thumbprint`);--> statement-breakpoint
CREATE TABLE `farmers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`identifier` text,
	`producer_id` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `farmers_producer_id_unique` ON `farmers` (`producer_id`);--> statement-breakpoint
CREATE TABLE `harvest_events` (
	`id` text PRIMARY KEY NOT NULL,
	`plot_id` text,
	`device_id` text,
	`agent_id` text,
	`seq` integer,
	`client_captured_at` text,
	`server_received_at` text NOT NULL,
	`lat` real,
	`lng` real,
	`accuracy_m` real,
	`cherry_kg` real,
	`prev_event_hash` text,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`signature` text NOT NULL,
	`boundary_status` text NOT NULL,
	`boundary_reason` text,
	`final_verdict` text,
	`anchor_seq` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "harvest_events_boundary_status_check" CHECK("harvest_events"."boundary_status" IN ('accepted','rejected')),
	CONSTRAINT "harvest_events_device_check" CHECK("harvest_events"."device_id" IS NOT NULL OR "harvest_events"."boundary_status" = 'rejected')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `harvest_events_payload_hash_unique` ON `harvest_events` (`payload_hash`);--> statement-breakpoint
CREATE INDEX `harvest_events_device_idx` ON `harvest_events` (`device_id`);--> statement-breakpoint
CREATE INDEX `harvest_events_plot_idx` ON `harvest_events` (`plot_id`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`seq` integer PRIMARY KEY NOT NULL,
	`prev_hash` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`ts` text NOT NULL,
	`entry_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_entry_hash_unique` ON `ledger_entries` (`entry_hash`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`path` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`mime` text NOT NULL,
	`exif` text,
	`thumb_path` text,
	FOREIGN KEY (`event_id`) REFERENCES `harvest_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `media_sha256_idx` ON `media` (`sha256`);--> statement-breakpoint
CREATE INDEX `media_event_idx` ON `media` (`event_id`);--> statement-breakpoint
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`office_phone` text,
	CONSTRAINT "organisations_type_check" CHECK("organisations"."type" IN ('fpo','buyer','processor'))
);
--> statement-breakpoint
CREATE TABLE `plots` (
	`id` text PRIMARY KEY NOT NULL,
	`farmer_id` text NOT NULL,
	`crop` text NOT NULL,
	`geojson` text NOT NULL,
	`area_ha` real NOT NULL,
	`registration_checks` text,
	`registration_stale` integer DEFAULT 0 NOT NULL,
	`anchor_seq` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`farmer_id`) REFERENCES `farmers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plots_crop_check" CHECK("plots"."crop" IN ('arabica','robusta')),
	CONSTRAINT "plots_registration_stale_check" CHECK("plots"."registration_stale" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `verification_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`run_no` integer NOT NULL,
	`verdict` text NOT NULL,
	`score` real NOT NULL,
	`checks` text NOT NULL,
	`unavailable_providers` text NOT NULL,
	`config_version` text NOT NULL,
	`config_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`anchor_seq` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `harvest_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "verification_runs_verdict_check" CHECK("verification_runs"."verdict" IN ('Verified','Needs Review','Rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_runs_event_run_unique` ON `verification_runs` (`event_id`,`run_no`);