CREATE TABLE `remote_sensing_cache` (
	`plot_id` text NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`month_bucket` text NOT NULL,
	`geometry_hash` text NOT NULL,
	`response` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`plot_id`, `provider`, `kind`, `month_bucket`, `geometry_hash`),
	CONSTRAINT "remote_sensing_cache_provider_check" CHECK("remote_sensing_cache"."provider" IN ('gfw','sentinel-hub')),
	CONSTRAINT "remote_sensing_cache_kind_check" CHECK("remote_sensing_cache"."kind" IN ('loss','ndvi_history','ndvi_window'))
);
