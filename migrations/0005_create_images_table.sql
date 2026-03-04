CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  source_url_sha256 TEXT NOT NULL UNIQUE,
  content_sha256 TEXT,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  etag TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_checked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_last_checked_at ON images(last_checked_at);
CREATE INDEX IF NOT EXISTS idx_images_content_sha256 ON images(content_sha256);
