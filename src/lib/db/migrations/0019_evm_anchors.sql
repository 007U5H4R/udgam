CREATE TABLE `evm_anchors` (
	`seq` integer PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`chain_id` integer,
	`contract` text,
	`tx_hash` text,
	`block_number` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "evm_anchors_status_check" CHECK("evm_anchors"."status" IN ('pending','anchored','failed')),
	CONSTRAINT "evm_anchors_anchored_check" CHECK(("evm_anchors"."status" = 'anchored') = ("evm_anchors"."chain_id" IS NOT NULL AND "evm_anchors"."contract" IS NOT NULL AND "evm_anchors"."tx_hash" IS NOT NULL AND "evm_anchors"."block_number" IS NOT NULL)),
	CONSTRAINT "evm_anchors_attempts_check" CHECK("evm_anchors"."attempts" >= 0)
);
