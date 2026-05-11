-- Per-inbox HTML signature, auto-attached to compose/reply drafts and
-- (optionally) hidden from the chat feed via a client preference.
ALTER TABLE sender_identities ADD COLUMN signature_html TEXT;
