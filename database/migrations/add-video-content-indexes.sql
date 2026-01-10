-- Migration: Add indexes for video content queries
-- This dramatically improves the slow json_object_agg query performance

-- Index for video_content lookups by video_id (most critical)
CREATE INDEX IF NOT EXISTS idx_video_content_video_id ON video_content(video_id);

-- Index for video_content lookups by content_type_id
CREATE INDEX IF NOT EXISTS idx_video_content_content_type_id ON video_content(content_type_id);

-- Composite index for the join pattern
CREATE INDEX IF NOT EXISTS idx_video_content_video_type ON video_content(video_id, content_type_id);

-- Index for videos by user with created_at for sorting (critical for pagination)
CREATE INDEX IF NOT EXISTS idx_videos_users_id ON videos(users_id);
CREATE INDEX IF NOT EXISTS idx_videos_users_created ON videos(users_id, created_at DESC);

-- Index for videos by status (commonly filtered)
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);

-- Composite index for user + status filtering
CREATE INDEX IF NOT EXISTS idx_videos_users_status ON videos(users_id, status);
