-- Small durable key/value cache. `caches.default` is a no-op on workers.dev
-- subdomains (only custom domains get a functional edge cache), so anything
-- that must survive across isolates — like the osu! OAuth token — goes here
-- instead.
CREATE TABLE IF NOT EXISTS kv_cache (
  key     TEXT PRIMARY KEY,
  value   TEXT NOT NULL,
  expires INTEGER NOT NULL
);
