-- App-level settings (admin-configurable). KV-shaped so we can add
-- new keys without further migrations:
--   - "brand_name": display name shown in the top-nav wordmark + auth
--     screens. Defaults to "saasmail" if no row is set.
--   - room for future: brand color, footer attribution toggle, etc.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
