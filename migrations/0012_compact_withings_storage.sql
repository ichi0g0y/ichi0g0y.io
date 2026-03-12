CREATE TABLE withings_connections_compact (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  userid TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT,
  scope TEXT,
  access_expires_at INTEGER NOT NULL,
  height_m REAL,
  notify_callback_url TEXT,
  notify_subscribed_at INTEGER,
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO withings_connections_compact (
  id, userid, access_token, refresh_token, token_type, scope, access_expires_at, height_m,
  notify_callback_url, notify_subscribed_at, last_synced_at, created_at, updated_at
)
SELECT
  c.id,
  c.userid,
  c.access_token,
  c.refresh_token,
  c.token_type,
  c.scope,
  c.access_expires_at,
  (
    SELECT mv.value_si
    FROM withings_measure_values mv
    WHERE mv.userid = c.userid
      AND mv.type_id = 4
      AND mv.value_si IS NOT NULL
    ORDER BY mv.measured_at DESC
    LIMIT 1
  ) AS height_m,
  c.notify_callback_url,
  c.notify_subscribed_at,
  c.last_synced_at,
  c.created_at,
  c.updated_at
FROM withings_connections c;

DROP TABLE withings_connections;
ALTER TABLE withings_connections_compact RENAME TO withings_connections;

CREATE TABLE withings_measurements_compact (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userid TEXT NOT NULL,
  grpid INTEGER NOT NULL,
  measured_at INTEGER NOT NULL,
  weight_kg REAL,
  fat_ratio REAL,
  bmi REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(userid, grpid)
);

INSERT INTO withings_measurements_compact (
  userid, grpid, measured_at, weight_kg, fat_ratio, bmi, created_at, updated_at
)
SELECT
  wm.userid,
  wm.grpid,
  wm.measured_at,
  wm.weight_kg,
  wm.fat_ratio,
  CASE
    WHEN wm.weight_kg IS NOT NULL
      AND c.height_m IS NOT NULL
      AND c.height_m > 0
    THEN wm.weight_kg / (c.height_m * c.height_m)
    ELSE NULL
  END AS bmi,
  wm.created_at,
  wm.updated_at
FROM withings_measurements wm
LEFT JOIN withings_connections c
  ON c.userid = wm.userid;

DROP TABLE withings_measurements;
ALTER TABLE withings_measurements_compact RENAME TO withings_measurements;

CREATE INDEX idx_withings_measurements_measured_at
  ON withings_measurements(measured_at DESC);

CREATE INDEX idx_withings_measurements_userid
  ON withings_measurements(userid, measured_at DESC);

CREATE TABLE withings_workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userid TEXT NOT NULL,
  data_key TEXT NOT NULL,
  measured_at INTEGER NOT NULL,
  workout_id INTEGER,
  category_id INTEGER,
  start_at INTEGER,
  end_at INTEGER,
  date_ymd TEXT,
  timezone TEXT,
  duration_sec INTEGER,
  distance_m REAL,
  calories_kcal REAL,
  steps INTEGER,
  intensity INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(userid, data_key)
);

INSERT INTO withings_workouts (
  userid, data_key, measured_at, workout_id, category_id, start_at, end_at, date_ymd,
  timezone, duration_sec, distance_m, calories_kcal, steps, intensity, created_at, updated_at
)
WITH workout_rollup AS (
  SELECT
    userid,
    data_key,
    COALESCE(MAX(measured_at), 0) AS measured_at,
    MAX(CASE WHEN path = 'id' THEN value_number END) AS workout_id,
    MAX(CASE WHEN path = 'category' THEN value_number END) AS category_id,
    MAX(CASE WHEN path = 'startdate' THEN value_number END) AS start_at,
    MAX(CASE WHEN path = 'enddate' THEN value_number END) AS end_at,
    MAX(CASE WHEN path = 'date' THEN value_text END) AS date_ymd,
    MAX(CASE WHEN path = 'timezone' THEN value_text END) AS timezone,
    MAX(CASE WHEN path = 'data.distance' THEN value_number END) AS distance_m,
    MAX(CASE WHEN path IN ('data.manual_distance', 'data."manual_distance"') THEN value_number END) AS manual_distance_m,
    MAX(CASE WHEN path = 'data.calories' THEN value_number END) AS calories_kcal,
    MAX(CASE WHEN path IN ('data.manual_calories', 'data."manual_calories"') THEN value_number END) AS manual_calories_kcal,
    MAX(CASE WHEN path = 'data.duration' THEN value_number END) AS duration_sec,
    MAX(CASE WHEN path = 'data.steps' THEN value_number END) AS steps,
    MAX(CASE WHEN path = 'data.intensity' THEN value_number END) AS intensity
  FROM withings_source_values
  WHERE source = 'measure.getworkouts'
  GROUP BY userid, data_key
)
SELECT
  userid,
  data_key,
  CAST(COALESCE(start_at, measured_at, 0) AS INTEGER) AS measured_at,
  CAST(workout_id AS INTEGER) AS workout_id,
  CAST(category_id AS INTEGER) AS category_id,
  CAST(start_at AS INTEGER) AS start_at,
  CAST(end_at AS INTEGER) AS end_at,
  date_ymd,
  timezone,
  CAST(
    CASE
      WHEN start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at THEN end_at - start_at
      ELSE duration_sec
    END
    AS INTEGER
  ) AS duration_sec,
  COALESCE(manual_distance_m, distance_m) AS distance_m,
  COALESCE(manual_calories_kcal, calories_kcal) AS calories_kcal,
  CAST(steps AS INTEGER) AS steps,
  CAST(intensity AS INTEGER) AS intensity,
  CAST(strftime('%s', 'now') AS INTEGER) AS created_at,
  CAST(strftime('%s', 'now') AS INTEGER) AS updated_at
FROM workout_rollup;

CREATE INDEX idx_withings_workouts_measured_at
  ON withings_workouts(measured_at DESC);

CREATE INDEX idx_withings_workouts_userid_measured_at
  ON withings_workouts(userid, measured_at DESC);

DROP TABLE IF EXISTS withings_measure_values;
DROP TABLE IF EXISTS withings_source_values;
DROP TABLE IF EXISTS withings_raw_data;
DROP TABLE IF EXISTS withings_notifications;
