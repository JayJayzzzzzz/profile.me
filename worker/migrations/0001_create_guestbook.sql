-- Guestbook entries. `iphash` is a salted SHA-256 of the poster's IP, used only
-- for rate limiting; no raw IPs are stored.
CREATE TABLE IF NOT EXISTS guestbook (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  message    TEXT NOT NULL,
  country    TEXT,
  iphash     TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guestbook_created ON guestbook (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guestbook_iphash ON guestbook (iphash, created_at);
