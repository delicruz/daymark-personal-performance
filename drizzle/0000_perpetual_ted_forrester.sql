CREATE TABLE `checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`entry_type` text NOT NULL,
	`energy` integer,
	`stress` integer,
	`sleep_minutes` integer,
	`workload` text,
	`planned_focus_minutes` integer,
	`productivity` integer,
	`focused_minutes` integer,
	`reflection` text,
	`prediction` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_checkins_user_date_type` ON `checkins` (`user_id`,`entry_date`,`entry_type`);--> statement-breakpoint
CREATE INDEX `idx_checkins_user_date` ON `checkins` (`user_id`,`entry_date`);--> statement-breakpoint
CREATE TABLE `priorities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`priority_date` text NOT NULL,
	`title` text NOT NULL,
	`impact` text DEFAULT 'MEDIUM IMPACT' NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_priorities_user_date` ON `priorities` (`user_id`,`priority_date`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`goal` text DEFAULT 'Improve daily focus' NOT NULL,
	`working_start` text DEFAULT '09:00' NOT NULL,
	`working_end` text DEFAULT '17:00' NOT NULL,
	`working_days` text DEFAULT 'weekdays' NOT NULL,
	`calendar_connected` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
