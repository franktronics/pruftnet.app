CREATE TABLE `capture_events` (
	`capture_id` text NOT NULL,
	`cursor` text NOT NULL,
	`event_json` text NOT NULL,
	CONSTRAINT `capture_events_pk` PRIMARY KEY(`capture_id`, `cursor`),
	CONSTRAINT `fk_capture_events_capture_id_capture_sessions_id_fk` FOREIGN KEY (`capture_id`) REFERENCES `capture_sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `capture_segments` (
	`capture_id` text NOT NULL,
	`generation` integer NOT NULL,
	`path` text NOT NULL UNIQUE,
	`committed_bytes` text NOT NULL,
	`committed_packets` text NOT NULL,
	`first_packet_id` text,
	`last_packet_id` text,
	`checksum_sha256` text,
	`valid` integer DEFAULT true NOT NULL,
	`evicted` integer DEFAULT false NOT NULL,
	`lease_count` integer DEFAULT 0 NOT NULL,
	`created_at_ns` text NOT NULL,
	CONSTRAINT `capture_segments_pk` PRIMARY KEY(`capture_id`, `generation`),
	CONSTRAINT `fk_capture_segments_capture_id_capture_sessions_id_fk` FOREIGN KEY (`capture_id`) REFERENCES `capture_sessions`(`id`),
	CONSTRAINT "capture_segments_generation" CHECK("generation" >= 0),
	CONSTRAINT "capture_segments_lease_count" CHECK("lease_count" >= 0),
	CONSTRAINT "capture_segments_committed_bytes" CHECK(length("committed_bytes") > 0 and "committed_bytes" not glob '*[^0-9]*')
);
--> statement-breakpoint
CREATE TABLE `capture_sessions` (
	`id` text PRIMARY KEY,
	`state` text NOT NULL,
	`source_json` text NOT NULL,
	`interface_count` integer NOT NULL,
	`source_format` text NOT NULL,
	`started_at_ns` text NOT NULL,
	`stopped_at_ns` text,
	`packet_count` text DEFAULT '0' NOT NULL,
	`retained_bytes` text DEFAULT '0' NOT NULL,
	`registry_revision` text DEFAULT '0' NOT NULL,
	`summary_cursor` text DEFAULT '0' NOT NULL,
	`analysis_cursor` text DEFAULT '0' NOT NULL,
	`failure_code` text,
	`failure_message` text,
	`delete_requested` integer DEFAULT false NOT NULL,
	`created_at_ns` text NOT NULL,
	`updated_at_ns` text NOT NULL,
	CONSTRAINT "capture_sessions_id" CHECK(length("id") = 32),
	CONSTRAINT "capture_sessions_interface_count" CHECK("interface_count" > 0),
	CONSTRAINT "capture_sessions_state" CHECK("state" in ('preparing','capturing','stopping','stopped','failed','interrupted','recovering','deleting','deleted')),
	CONSTRAINT "capture_sessions_source_format" CHECK("source_format" in ('pcapng','pcap'))
);
--> statement-breakpoint
CREATE TABLE `capture_stat_samples` (
	`capture_id` text NOT NULL,
	`sampled_at_ns` text NOT NULL,
	`stats_json` text NOT NULL,
	CONSTRAINT `capture_stat_samples_pk` PRIMARY KEY(`capture_id`, `sampled_at_ns`),
	CONSTRAINT `fk_capture_stat_samples_capture_id_capture_sessions_id_fk` FOREIGN KEY (`capture_id`) REFERENCES `capture_sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `capture_summaries` (
	`capture_id` text NOT NULL,
	`cursor` text NOT NULL,
	`packet_id` text NOT NULL,
	`summary_json` text NOT NULL,
	CONSTRAINT `capture_summaries_pk` PRIMARY KEY(`capture_id`, `cursor`),
	CONSTRAINT `fk_capture_summaries_capture_id_capture_sessions_id_fk` FOREIGN KEY (`capture_id`) REFERENCES `capture_sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `export_job_segments` (
	`export_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`capture_id` text NOT NULL,
	`generation` integer NOT NULL,
	`committed_bytes` text NOT NULL,
	`committed_packets` text NOT NULL,
	CONSTRAINT `export_job_segments_pk` PRIMARY KEY(`export_id`, `ordinal`),
	CONSTRAINT `fk_export_job_segments_export_id_export_jobs_id_fk` FOREIGN KEY (`export_id`) REFERENCES `export_jobs`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_export_job_segments_capture_id_generation_capture_segments_capture_id_generation_fk` FOREIGN KEY (`capture_id`,`generation`) REFERENCES `capture_segments`(`capture_id`,`generation`),
	CONSTRAINT "export_job_segments_ordinal" CHECK("ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE `export_jobs` (
	`id` text PRIMARY KEY,
	`capture_id` text NOT NULL,
	`idempotency_key` text NOT NULL UNIQUE,
	`state` text NOT NULL,
	`format` text NOT NULL,
	`destination_kind` text NOT NULL,
	`destination_token` text,
	`artifact_path` text,
	`partial_path` text,
	`packets_total` text DEFAULT '0' NOT NULL,
	`packets_written` text DEFAULT '0' NOT NULL,
	`bytes_written` text DEFAULT '0' NOT NULL,
	`retained_portion_only` integer DEFAULT false NOT NULL,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`checksum_sha256` text,
	`final_size` text,
	`failure_code` text,
	`failure_message` text,
	`created_at_ns` text NOT NULL,
	`started_at_ns` text,
	`completed_at_ns` text,
	`updated_at_ns` text NOT NULL,
	CONSTRAINT `fk_export_jobs_capture_id_capture_sessions_id_fk` FOREIGN KEY (`capture_id`) REFERENCES `capture_sessions`(`id`),
	CONSTRAINT "export_jobs_state" CHECK("state" in ('queued','preparing','running','finalizing','completed','failed','cancelled','interrupted')),
	CONSTRAINT "export_jobs_format" CHECK("format" in ('pcapng','pcap')),
	CONSTRAINT "export_jobs_destination_kind" CHECK("destination_kind" in ('desktop','server'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `capture_sessions_one_live` ON `capture_sessions` (1) WHERE "capture_sessions"."state" in ('preparing', 'capturing', 'stopping');--> statement-breakpoint
CREATE INDEX `capture_summaries_packet` ON `capture_summaries` (`capture_id`,`packet_id`);--> statement-breakpoint
CREATE INDEX `export_jobs_capture_id` ON `export_jobs` (`capture_id`);