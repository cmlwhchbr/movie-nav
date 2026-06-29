CREATE TABLE IF NOT EXISTS maccms_types (
  type_id INTEGER PRIMARY KEY,
  type_pid INTEGER NOT NULL DEFAULT 0,
  type_mid INTEGER NOT NULL DEFAULT 1,
  type_name TEXT NOT NULL,
  type_en TEXT,
  type_sort INTEGER NOT NULL DEFAULT 0,
  type_status INTEGER NOT NULL DEFAULT 1,
  type_pic TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS play_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  source_index INTEGER NOT NULL,
  source_code TEXT NOT NULL,
  server_code TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(video_id, source_index),
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS migration_state (
  name TEXT PRIMARY KEY,
  last_id INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  migrated INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_play_sources_video ON play_sources(video_id);
CREATE INDEX IF NOT EXISTS idx_play_sources_code ON play_sources(source_code);
CREATE INDEX IF NOT EXISTS idx_videos_source ON videos(source_key, source_vod_id);

ALTER TABLE episodes ADD COLUMN play_source_id INTEGER;
ALTER TABLE episodes ADD COLUMN source_index INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_episodes_play_source ON episodes(play_source_id);
