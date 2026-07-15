CREATE TABLE `export_artifacts` (
	`capture_id` text NOT NULL,
	`format` text NOT NULL,
	`source_fingerprint` text NOT NULL,
	`artifact_path` text NOT NULL,
	`retained_portion_only` integer DEFAULT false NOT NULL,
	`checksum_sha256` text NOT NULL,
	`final_size` text NOT NULL,
	`created_at_ns` text NOT NULL,
	`updated_at_ns` text NOT NULL,
	CONSTRAINT `export_artifacts_pk` PRIMARY KEY(`capture_id`, `format`),
	CONSTRAINT `fk_export_artifacts_capture_id_capture_sessions_id_fk` FOREIGN KEY (`capture_id`) REFERENCES `capture_sessions`(`id`),
	CONSTRAINT "export_artifacts_format" CHECK("format" in ('pcapng','pcap'))
);
--> statement-breakpoint
DROP INDEX IF EXISTS `export_jobs_capture_id`;--> statement-breakpoint
DROP TABLE `export_job_segments`;--> statement-breakpoint
DROP TABLE `export_jobs`;