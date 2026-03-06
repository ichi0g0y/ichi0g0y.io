CREATE TABLE IF NOT EXISTS twitter_connections (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  user_id TEXT NOT NULL,
  username TEXT,
  name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT,
  scope TEXT,
  access_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS twitter_post_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  template_text TEXT NOT NULL,
  last_posted_grpid INTEGER,
  last_posted_measured_at INTEGER,
  last_posted_tweet_id TEXT,
  last_posted_tweet_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
