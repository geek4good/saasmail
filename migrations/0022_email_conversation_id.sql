-- Group conversations: a `conversation_id` column on `emails` and
-- `sent_emails` that ties together messages belonging to the same
-- multi-participant thread.
--
-- The id is computed deterministically from
--    sha256("<inbox>::<sorted-lowercased-external-emails>")
-- and only set when the thread has 2+ EXTERNAL participants. When set,
-- the inbox list surfaces these emails as a single group row with
-- overlapping avatars instead of one row per participant. When NULL,
-- the existing per-person grouping (keyed on emails.person_id /
-- sent_emails.person_id) takes over — that's the right shape for 1-on-1
-- threads, and it preserves backward compatibility for old rows.
--
-- Indexed because the inbox list query groups by it.
ALTER TABLE emails ADD COLUMN conversation_id TEXT;
ALTER TABLE sent_emails ADD COLUMN conversation_id TEXT;
CREATE INDEX emails_conversation_idx ON emails(conversation_id);
CREATE INDEX sent_emails_conversation_idx ON sent_emails(conversation_id);
