CREATE TABLE `agent_plots` (
	`agent_id` text NOT NULL,
	`plot_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	`revoked_at` text,
	PRIMARY KEY(`agent_id`, `plot_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plot_id`) REFERENCES `plots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agent_plots_plot_idx` ON `agent_plots` (`plot_id`);--> statement-breakpoint
CREATE TABLE `enrollment_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `enrollment_codes_agent_idx` ON `enrollment_codes` (`agent_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`key`, `window_start`)
);
