CREATE TABLE IF NOT EXISTS withings_raw_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userid TEXT NOT NULL,
  source TEXT NOT NULL,
  data_key TEXT NOT NULL,
  measured_at INTEGER,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(userid, source, data_key)
);

CREATE INDEX IF NOT EXISTS idx_withings_raw_data_user_source_measured_at
  ON withings_raw_data(userid, source, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_withings_raw_data_source
  ON withings_raw_data(source);
