CREATE TABLE `staged_media` (
	`sha256` text NOT NULL,
	`agent_id` text NOT NULL,
	`device_id` text NOT NULL,
	`size` integer NOT NULL,
	`mime` text NOT NULL,
	`path` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`sha256`, `agent_id`)
);
--> statement-breakpoint
CREATE INDEX `staged_media_agent_expiry_idx` ON `staged_media` (`agent_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `staged_media_expiry_idx` ON `staged_media` (`expires_at`);