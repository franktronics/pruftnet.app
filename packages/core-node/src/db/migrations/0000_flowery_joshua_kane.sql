CREATE TABLE IF NOT EXISTS `Analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`data` text NOT NULL,
	`imageId` integer,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`imageId`) REFERENCES `Image`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Image` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `Image_path_unique` ON `Image` (`path`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`context` text,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`maxPacketBufferSize` integer NOT NULL,
	`promiscuousMode` integer NOT NULL,
	`protocolEntryFile` text NOT NULL,
	`defaultCaptureTab` text NOT NULL,
	`connectionLineType` text NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
