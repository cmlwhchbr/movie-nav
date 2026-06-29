CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  source_vod_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  pic TEXT,
  note TEXT,
  actor TEXT,
  director TEXT,
  area TEXT,
  lang TEXT,
  year TEXT,
  description TEXT,
  source_updated_at TEXT,
  collected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_key, source_vod_id)
);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  episode_index INTEGER NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  player TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(video_id, episode_index),
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collect_state (
  source_key TEXT PRIMARY KEY,
  next_page INTEGER NOT NULL DEFAULT 1,
  page_count INTEGER NOT NULL DEFAULT 0,
  record_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_videos_name ON videos(name);
CREATE INDEX IF NOT EXISTS idx_videos_type ON videos(type);
CREATE INDEX IF NOT EXISTS idx_videos_updated ON videos(source_updated_at);
CREATE INDEX IF NOT EXISTS idx_episodes_video ON episodes(video_id);
