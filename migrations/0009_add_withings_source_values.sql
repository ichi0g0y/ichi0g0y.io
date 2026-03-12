CREATE TABLE IF NOT EXISTS withings_source_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userid TEXT NOT NULL,
  source TEXT NOT NULL,
  data_key TEXT NOT NULL,
  measured_at INTEGER,
  path TEXT NOT NULL,
  value_type TEXT NOT NULL,
  value_number REAL,
  value_text TEXT,
  value_boolean INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(userid, source, data_key, path)
);

CREATE INDEX IF NOT EXISTS idx_withings_source_values_user_source_measured_at
  ON withings_source_values(userid, source, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_withings_source_values_source_path
  ON withings_source_values(source, path);

CREATE INDEX IF NOT EXISTS idx_withings_source_values_record
  ON withings_source_values(userid, source, data_key);

WITH flattened AS (
  SELECT
    wr.userid AS userid,
    wr.source AS source,
    wr.data_key AS data_key,
    wr.measured_at AS measured_at,
    CASE
      WHEN jt.fullkey = '$' THEN '$'
      WHEN jt.fullkey LIKE '$.%' THEN substr(jt.fullkey, 3)
      ELSE substr(jt.fullkey, 2)
    END AS path,
    CASE
      WHEN jt.type IN ('integer', 'real') THEN 'number'
      WHEN jt.type = 'text' THEN 'string'
      WHEN jt.type IN ('true', 'false') THEN 'boolean'
      WHEN jt.type = 'null' THEN 'null'
      ELSE 'json'
    END AS value_type,
    CASE
      WHEN jt.type IN ('integer', 'real') THEN CAST(jt.atom AS REAL)
      ELSE NULL
    END AS value_number,
    CASE
      WHEN jt.type = 'text' THEN CAST(jt.atom AS TEXT)
      WHEN jt.type IN ('array', 'object') THEN CAST(jt.value AS TEXT)
      ELSE NULL
    END AS value_text,
    CASE
      WHEN jt.type = 'true' THEN 1
      WHEN jt.type = 'false' THEN 0
      ELSE NULL
    END AS value_boolean
  FROM withings_raw_data wr
  JOIN json_tree(wr.payload_json) jt
  WHERE jt.type IN ('null', 'integer', 'real', 'text', 'true', 'false', 'array', 'object')
    AND NOT (jt.fullkey = '$' AND jt.type = 'object')
)
INSERT INTO withings_source_values (
  userid, source, data_key, measured_at, path, value_type,
  value_number, value_text, value_boolean, created_at, updated_at
)
SELECT
  userid,
  source,
  data_key,
  measured_at,
  path,
  value_type,
  value_number,
  value_text,
  value_boolean,
  CAST(strftime('%s', 'now') AS INTEGER),
  CAST(strftime('%s', 'now') AS INTEGER)
FROM flattened
WHERE 1 = 1
ON CONFLICT(userid, source, data_key, path) DO UPDATE SET
  measured_at = excluded.measured_at,
  value_type = excluded.value_type,
  value_number = excluded.value_number,
  value_text = excluded.value_text,
  value_boolean = excluded.value_boolean,
  updated_at = excluded.updated_at;
