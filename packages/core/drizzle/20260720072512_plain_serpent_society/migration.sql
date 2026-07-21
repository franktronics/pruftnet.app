ALTER TABLE `capture_sessions` ADD `summary_count` text DEFAULT '0' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_capture_summaries` (
	`capture_id` text NOT NULL,
	`cursor` text NOT NULL,
	`row_index` integer NOT NULL,
	`packet_id` text NOT NULL,
	`summary_json` text NOT NULL,
	CONSTRAINT `capture_summaries_pk` PRIMARY KEY(`capture_id`, `cursor`),
	CONSTRAINT `fk_capture_summaries_capture_id_capture_sessions_id_fk` FOREIGN KEY (`capture_id`) REFERENCES `capture_sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT "capture_summaries_row_index" CHECK("row_index" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_capture_summaries`(`capture_id`, `cursor`, `row_index`, `packet_id`, `summary_json`)
SELECT
	`capture_id`,
	`cursor`,
	row_number() OVER (
		PARTITION BY `capture_id`
		ORDER BY length(`cursor`), `cursor`
	) - 1,
	`packet_id`,
	`summary_json`
FROM `capture_summaries`;--> statement-breakpoint
DROP TABLE `capture_summaries`;--> statement-breakpoint
ALTER TABLE `__new_capture_summaries` RENAME TO `capture_summaries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `capture_summaries_packet` ON `capture_summaries` (`capture_id`,`packet_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `capture_summaries_row` ON `capture_summaries` (`capture_id`,`row_index`);--> statement-breakpoint
UPDATE `capture_sessions`
SET `summary_count` = cast((
	SELECT count(*)
	FROM `capture_summaries`
	WHERE `capture_summaries`.`capture_id` = `capture_sessions`.`id`
) AS text);
