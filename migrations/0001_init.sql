CREATE TABLE IF NOT EXISTS login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_codes_email ON login_codes(email);
CREATE INDEX IF NOT EXISTS idx_login_codes_expires ON login_codes(expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  refresh_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_email ON auth_sessions(email);

CREATE TABLE IF NOT EXISTS gear_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  image_url TEXT,
  link_url TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gear_items_sort ON gear_items(sort_order, id);

INSERT INTO gear_items (title, category, image_url, link_url, description, sort_order, created_at, updated_at)
SELECT 'Ryzen 9 7950X3D', 'ゲーミングPC', '/gear/gaming-pc.jpg', NULL, NULL, 10, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM gear_items);

INSERT INTO gear_items (title, category, image_url, link_url, description, sort_order, created_at, updated_at)
SELECT 'ASUS RTX4070ti Super', 'ゲーミングPC', '/gear/gaming-pc.jpg', NULL, NULL, 20, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM gear_items WHERE title = 'ASUS RTX4070ti Super');

INSERT INTO gear_items (title, category, image_url, link_url, description, sort_order, created_at, updated_at)
SELECT 'DDR5 64GB', 'ゲーミングPC', '/gear/gaming-pc.jpg', NULL, NULL, 30, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM gear_items WHERE title = 'DDR5 64GB');

INSERT INTO gear_items (title, category, image_url, link_url, description, sort_order, created_at, updated_at)
SELECT 'Mac Strudio M4 Max 64GB', '配信機材', '/gear/stream-audio.jpg', NULL, NULL, 40, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM gear_items WHERE title = 'Mac Strudio M4 Max 64GB');

INSERT INTO gear_items (title, category, image_url, link_url, description, sort_order, created_at, updated_at)
SELECT 'BabyFace Pro fs', '配信機材', '/gear/stream-audio.jpg', NULL, NULL, 50, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM gear_items WHERE title = 'BabyFace Pro fs');

INSERT INTO gear_items (title, category, image_url, link_url, description, sort_order, created_at, updated_at)
SELECT 'SM7B', '配信機材', '/gear/stream-audio.jpg', NULL, NULL, 60, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM gear_items WHERE title = 'SM7B');
