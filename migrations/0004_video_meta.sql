ALTER TABLE videos ADD COLUMN type_id INTEGER;
ALTER TABLE videos ADD COLUMN parent_type_id INTEGER;
ALTER TABLE videos ADD COLUMN tags TEXT;
ALTER TABLE videos ADD COLUMN hits INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_videos_hits ON videos(hits);
CREATE INDEX IF NOT EXISTS idx_videos_type_id ON videos(type_id);
CREATE INDEX IF NOT EXISTS idx_videos_tags ON videos(tags);
