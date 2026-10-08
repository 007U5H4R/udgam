CREATE TABLE `crop_yield_reference` (
	`crop` text NOT NULL,
	`variety` text NOT NULL,
	`min_kg_ha` real,
	`max_kg_ha` real NOT NULL,
	`cherry_to_clean_ratio` real NOT NULL,
	`source` text NOT NULL,
	`source_url` text NOT NULL,
	`version` text NOT NULL,
	PRIMARY KEY(`crop`, `variety`),
	CONSTRAINT "crop_yield_reference_crop_check" CHECK("crop_yield_reference"."crop" IN ('arabica','robusta')),
	CONSTRAINT "crop_yield_reference_values_check" CHECK("crop_yield_reference"."max_kg_ha" > 0 AND "crop_yield_reference"."cherry_to_clean_ratio" > 0 AND "crop_yield_reference"."cherry_to_clean_ratio" <= 1)
);
--> statement-breakpoint
DROP INDEX `harvest_events_payload_hash_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `harvest_events_accepted_payload_hash_unique` ON `harvest_events` (`payload_hash`) WHERE boundary_status = 'accepted';--> statement-breakpoint
CREATE UNIQUE INDEX `harvest_events_rejected_payload_reason_unique` ON `harvest_events` (`payload_hash`,`boundary_reason`) WHERE boundary_status = 'rejected';