-- Extend attachments table to also store attachments for outgoing (sent) emails.
-- email_id becomes nullable (sent attachments don't reference a received email).
-- sent_email_id is added for linking to sent_emails.
ALTER TABLE `attachments` ALTER COLUMN `email_id` DROP NOT NULL;
ALTER TABLE `attachments` ADD COLUMN `sent_email_id` text;
CREATE INDEX `attachments_sent_email_id_idx` ON `attachments` (`sent_email_id`);
