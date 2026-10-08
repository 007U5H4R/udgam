CREATE TABLE `attestations` (
	`id` text PRIMARY KEY NOT NULL,
	`plot_id` text NOT NULL,
	`type` text NOT NULL,
	`file_hash` text NOT NULL,
	`file_path` text NOT NULL,
	`issuer` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text NOT NULL,
	`anchor_seq` integer NOT NULL,
	FOREIGN KEY (`plot_id`) REFERENCES `plots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attestations_type_check" CHECK("attestations"."type" IN ('organic'))
);
--> statement-breakpoint
CREATE INDEX `attestations_plot_idx` ON `attestations` (`plot_id`);