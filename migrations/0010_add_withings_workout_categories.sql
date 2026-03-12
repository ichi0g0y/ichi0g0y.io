CREATE TABLE IF NOT EXISTS withings_workout_categories (
  category_id INTEGER PRIMARY KEY,
  category_key TEXT NOT NULL,
  label_ja TEXT NOT NULL,
  label_en TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO withings_workout_categories (
  category_id, category_key, label_ja, label_en, created_at, updated_at
)
VALUES
  (1, 'walking_running', 'ウォーキング/ランニング', 'Walking/Running', CAST(strftime('%s', 'now') AS INTEGER), CAST(strftime('%s', 'now') AS INTEGER)),
  (6, 'cycling', 'サイクリング', 'Cycling', CAST(strftime('%s', 'now') AS INTEGER), CAST(strftime('%s', 'now') AS INTEGER))
ON CONFLICT(category_id) DO UPDATE SET
  category_key = excluded.category_key,
  label_ja = excluded.label_ja,
  label_en = excluded.label_en,
  updated_at = excluded.updated_at;
