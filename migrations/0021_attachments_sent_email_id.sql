-- Extend attachments table to also store attachments for outgoing (sent) emails.
-- email_id becomes nullable (sent attachments don't reference a received email).
-- sent_email_id is added for linking to sent_emails.
--
-- SQLite (D1) does not support ALTER COLUMN, so we must recreate the table.

CREATE TABLE `attachments_new` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`sent_email_id` text
);

INSERT INTO `attachments_new` (`id`, `email_id`, `filename`, `content_type`, `size`, `r2_key`, `created_at`)
	SELECT `id`, `email_id`, `filename`, `content_type`, `size`, `r2_key`, `created_at` FROM `attachments`;

DROP TABLE `attachments`;

ALTER TABLE `attachments_new` RENAME TO `attachments`;

CREATE INDEX `attachments_email_id_idx` ON `attachments` (`email_id`);
CREATE INDEX `attachments_sent_email_id_idx` ON `attachments` (`sent_email_id`);
