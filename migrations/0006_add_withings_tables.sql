CREATE TABLE IF NOT EXISTS withings_connections (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  userid TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT,
  scope TEXT,
  access_expires_at INTEGER NOT NULL,
  notify_callback_url TEXT,
  notify_subscribed_at INTEGER,
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS withings_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userid TEXT,
  appli INTEGER,
  startdate INTEGER,
  enddate INTEGER,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_withings_notifications_created_at
  ON withings_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withings_notifications_userid
  ON withings_notifications(userid);

CREATE TABLE IF NOT EXISTS withings_measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userid TEXT NOT NULL,
  grpid INTEGER NOT NULL,
  measured_at INTEGER NOT NULL,
  category INTEGER,
  attrib INTEGER,
  weight_kg REAL,
  fat_ratio REAL,
  fat_mass_kg REAL,
  lean_mass_kg REAL,
  raw_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(userid, grpid)
);

CREATE INDEX IF NOT EXISTS idx_withings_measurements_measured_at
  ON withings_measurements(measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_withings_measurements_userid
  ON withings_measurements(userid, measured_at DESC);
