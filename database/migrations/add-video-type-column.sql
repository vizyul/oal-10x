-- Migration: Add video_type column to videos table
-- Purpose: Track whether a video is a regular video, short, or live stream
-- Created: 2026-01-22

BEGIN;

-- Add video_type column
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS video_type VARCHAR(10) DEFAULT 'video';

-- Add comment explaining the column
COMMENT ON COLUMN videos.video_type IS 'Type of video: video (regular), short (YouTube Short), live (live stream)';

-- Create index for filtering by video type
CREATE INDEX IF NOT EXISTS idx_videos_video_type ON videos(video_type);

-- Update existing videos based on duration as a rough heuristic
-- Videos <= 180 seconds (3 min) with no explicit type could be shorts
-- But we'll leave existing as 'video' since we can't reliably determine
-- New imports will properly detect the type

COMMIT;
