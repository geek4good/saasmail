-- Multi-recipient support: a `cc` JSON column on both inbound `emails`
-- and outbound `sent_emails`. Format: JSON array of {"email","name"}
-- objects, e.g. [{"email":"a@b.com","name":"Alex"}].
--
-- Stored as TEXT (JSON) instead of a normalized join table because:
--   * each email's CC list is small (<10 typically)
--   * we never query "find all emails CC'd to X" — the use cases are
--     read-with-message and roster-diff between consecutive messages
--   * keeps the schema and the FTS triggers simple
--
-- NULL means "no CC" (semantically equivalent to []).
ALTER TABLE emails ADD COLUMN cc TEXT;
ALTER TABLE sent_emails ADD COLUMN cc TEXT;
