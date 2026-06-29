DROP TABLE IF EXISTS episodes;

CREATE TABLE episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  play_source_id INTEGER,
  source_index INTEGER NOT NULL DEFAULT 0,
  episode_index INTEGER NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  player TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(video_id, play_source_id, episode_index),
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE,
  FOREIGN KEY(play_source_id) REFERENCES play_sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_episodes_video ON episodes(video_id);
CREATE INDEX IF NOT EXISTS idx_episodes_play_source ON episodes(play_source_id);
