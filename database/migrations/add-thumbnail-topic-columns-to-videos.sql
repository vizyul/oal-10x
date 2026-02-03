-- Migration: Add thumbnail_topic and thumbnail_subtopic columns to videos table
-- Purpose: Persist the main topic and sub-topic used during thumbnail generation
-- so they can be auto-populated when re-opening the Thumbnail Studio for a video.

ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_topic VARCHAR(255);
ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_subtopic VARCHAR(255);
