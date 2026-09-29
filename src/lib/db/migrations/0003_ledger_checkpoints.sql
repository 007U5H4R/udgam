CREATE TABLE `ledger_checkpoints` (
	`id` integer PRIMARY KEY NOT NULL,
	`from_seq` integer NOT NULL,
	`to_seq` integer NOT NULL,
	`merkle_root` text NOT NULL,
	`prev_checkpoint_hash` text NOT NULL,
	`ts` text NOT NULL,
	`key_id` text NOT NULL,
	`signature` text NOT NULL,
	FOREIGN KEY (`from_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ledger_checkpoints_range_check" CHECK("ledger_checkpoints"."from_seq" <= "ledger_checkpoints"."to_seq")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_checkpoints_to_seq_unique` ON `ledger_checkpoints` (`to_seq`);