CREATE TABLE `agreements` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_id_hex` text NOT NULL,
	`buyer_org` text NOT NULL,
	`fpo_org` text NOT NULL,
	`crop` text NOT NULL,
	`agreed_kg` real NOT NULL,
	`min_grade` integer NOT NULL,
	`amount_paise` integer NOT NULL,
	`deadline` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`created_tx_hash` text NOT NULL,
	`anchor_seq` integer NOT NULL,
	`funded_at` text,
	`funded_tx_hash` text,
	`funded_anchor_seq` integer,
	`closed_at` text,
	`closed_tx_hash` text,
	`closed_anchor_seq` integer,
	FOREIGN KEY (`buyer_org`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fpo_org`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`funded_anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agreements_crop_check" CHECK("agreements"."crop" IN ('arabica','robusta')),
	CONSTRAINT "agreements_status_check" CHECK("agreements"."status" IN ('created','funded','settled','refunded')),
	CONSTRAINT "agreements_kg_check" CHECK("agreements"."agreed_kg" > 0),
	CONSTRAINT "agreements_grade_check" CHECK("agreements"."min_grade" IN (90,80,70,60,40)),
	CONSTRAINT "agreements_amount_check" CHECK("agreements"."amount_paise" > 0),
	CONSTRAINT "agreements_orgs_check" CHECK("agreements"."buyer_org" <> "agreements"."fpo_org"),
	CONSTRAINT "agreements_funded_check" CHECK(("agreements"."status" = 'created') = ("agreements"."funded_anchor_seq" IS NULL) AND ("agreements"."funded_anchor_seq" IS NULL) = ("agreements"."funded_at" IS NULL) AND ("agreements"."funded_anchor_seq" IS NULL) = ("agreements"."funded_tx_hash" IS NULL)),
	CONSTRAINT "agreements_closed_check" CHECK(("agreements"."status" IN ('settled','refunded')) = ("agreements"."closed_anchor_seq" IS NOT NULL) AND ("agreements"."closed_anchor_seq" IS NULL) = ("agreements"."closed_at" IS NULL) AND ("agreements"."closed_anchor_seq" IS NULL) = ("agreements"."closed_tx_hash" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agreements_chain_id_hex_unique` ON `agreements` (`chain_id_hex`);--> statement-breakpoint
CREATE INDEX `agreements_buyer_idx` ON `agreements` (`buyer_org`);--> statement-breakpoint
CREATE INDEX `agreements_fpo_idx` ON `agreements` (`fpo_org`);--> statement-breakpoint
CREATE TABLE `quality_attestations` (
	`id` text PRIMARY KEY NOT NULL,
	`agreement_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`grade` integer NOT NULL,
	`signer_org` text NOT NULL,
	`signer_address` text NOT NULL,
	`eip712_sig` text NOT NULL,
	`signed_by` text NOT NULL,
	`created_at` text NOT NULL,
	`anchor_seq` integer NOT NULL,
	FOREIGN KEY (`agreement_id`) REFERENCES `agreements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signer_org`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quality_attestations_grade_check" CHECK("quality_attestations"."grade" IN (90,80,70,60,40))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quality_attestations_agreement_batch_unique` ON `quality_attestations` (`agreement_id`,`batch_id`);--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`agreement_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`attestation_id` text NOT NULL,
	`delivered_kg` real NOT NULL,
	`pickings` integer NOT NULL,
	`verified_pickings` integer NOT NULL,
	`all_verified` integer NOT NULL,
	`grade` integer NOT NULL,
	`outcome` text NOT NULL,
	`reasons` text NOT NULL,
	`tx_hash` text NOT NULL,
	`block_number` integer NOT NULL,
	`settled_by` text NOT NULL,
	`created_at` text NOT NULL,
	`anchor_seq` integer NOT NULL,
	FOREIGN KEY (`agreement_id`) REFERENCES `agreements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attestation_id`) REFERENCES `quality_attestations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`settled_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anchor_seq`) REFERENCES `ledger_entries`(`seq`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "settlements_outcome_check" CHECK("settlements"."outcome" IN ('released','not_released')),
	CONSTRAINT "settlements_grade_check" CHECK("settlements"."grade" IN (90,80,70,60,40)),
	CONSTRAINT "settlements_verified_check" CHECK("settlements"."all_verified" IN (0,1) AND "settlements"."verified_pickings" <= "settlements"."pickings" AND "settlements"."verified_pickings" >= 0)
);
--> statement-breakpoint
CREATE INDEX `settlements_agreement_idx` ON `settlements` (`agreement_id`);--> statement-breakpoint
CREATE INDEX `settlements_batch_idx` ON `settlements` (`batch_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `settlements_one_release_idx` ON `settlements` (`agreement_id`) WHERE "settlements"."outcome" = 'released';