CREATE TABLE `admin_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`admin_id` text NOT NULL,
	`new_verdict` text NOT NULL,
	`reason` text NOT NULL,
	`signature` text NOT NULL,
	`key_id` text NOT NULL,
	`created_at` text NOT NULL,
	`anchor_seq` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `verification_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`admin_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "admin_overrides_verdict_check" CHECK("admin_overrides"."new_verdict" IN ('Verified','Rejected')),
	CONSTRAINT "admin_overrides_reason_check" CHECK(length(trim("admin_overrides"."reason")) >= 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_overrides_run_id_unique` ON `admin_overrides` (`run_id`);