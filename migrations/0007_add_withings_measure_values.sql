CREATE TABLE IF NOT EXISTS withings_measure_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userid TEXT NOT NULL,
  grpid INTEGER NOT NULL,
  measure_index INTEGER NOT NULL,
  measured_at INTEGER NOT NULL,
  category INTEGER,
  attrib INTEGER,
  type_id INTEGER,
  unit INTEGER,
  raw_value REAL,
  value_si REAL,
  raw_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(userid, grpid, measure_index)
);

CREATE INDEX IF NOT EXISTS idx_withings_measure_values_userid_measured_at
  ON withings_measure_values(userid, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_withings_measure_values_type_id
  ON withings_measure_values(type_id);

CREATE INDEX IF NOT EXISTS idx_withings_measure_values_grpid
  ON withings_measure_values(userid, grpid);

WITH parsed AS (
  SELECT
    wm.userid AS userid,
    wm.grpid AS grpid,
    CAST(m.key AS INTEGER) AS measure_index,
    wm.measured_at AS measured_at,
    wm.category AS category,
    wm.attrib AS attrib,
    CAST(json_extract(m.value, '$.type') AS INTEGER) AS type_id,
    CAST(json_extract(m.value, '$.unit') AS INTEGER) AS unit_value,
    CAST(json_extract(m.value, '$.value') AS REAL) AS raw_value,
    m.value AS raw_measure_json
  FROM withings_measurements wm
  JOIN json_each(wm.raw_json, '$.measures') m
)
INSERT INTO withings_measure_values (
  userid, grpid, measure_index, measured_at, category, attrib,
  type_id, unit, raw_value, value_si, raw_json, created_at, updated_at
)
SELECT
  userid,
  grpid,
  measure_index,
  measured_at,
  category,
  attrib,
  type_id,
  unit_value,
  raw_value,
  CASE
    WHEN raw_value IS NULL OR unit_value IS NULL THEN NULL
    WHEN unit_value = -9 THEN raw_value * 0.000000001
    WHEN unit_value = -8 THEN raw_value * 0.00000001
    WHEN unit_value = -7 THEN raw_value * 0.0000001
    WHEN unit_value = -6 THEN raw_value * 0.000001
    WHEN unit_value = -5 THEN raw_value * 0.00001
    WHEN unit_value = -4 THEN raw_value * 0.0001
    WHEN unit_value = -3 THEN raw_value * 0.001
    WHEN unit_value = -2 THEN raw_value * 0.01
    WHEN unit_value = -1 THEN raw_value * 0.1
    WHEN unit_value = 0 THEN raw_value
    WHEN unit_value = 1 THEN raw_value * 10
    WHEN unit_value = 2 THEN raw_value * 100
    WHEN unit_value = 3 THEN raw_value * 1000
    WHEN unit_value = 4 THEN raw_value * 10000
    WHEN unit_value = 5 THEN raw_value * 100000
    WHEN unit_value = 6 THEN raw_value * 1000000
    WHEN unit_value = 7 THEN raw_value * 10000000
    WHEN unit_value = 8 THEN raw_value * 100000000
    WHEN unit_value = 9 THEN raw_value * 1000000000
    ELSE NULL
  END AS value_si,
  raw_measure_json,
  CAST(strftime('%s', 'now') AS INTEGER),
  CAST(strftime('%s', 'now') AS INTEGER)
FROM parsed
WHERE 1 = 1
ON CONFLICT(userid, grpid, measure_index) DO UPDATE SET
  measured_at = excluded.measured_at,
  category = excluded.category,
  attrib = excluded.attrib,
  type_id = excluded.type_id,
  unit = excluded.unit,
  raw_value = excluded.raw_value,
  value_si = excluded.value_si,
  raw_json = excluded.raw_json,
  updated_at = excluded.updated_at;
