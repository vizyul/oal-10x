-- Migration: Change thumbnail usage limits from per-month to per-video
-- Instead of tracking monthly iterations globally, we now track iterations per video.
-- Each video gets its own iteration budget based on the user's subscription tier.

-- Step 1: Add video_id column to thumbnail_usage (nullable so old rows stay NULL)
ALTER TABLE thumbnail_usage
ADD COLUMN IF NOT EXISTS video_id INTEGER REFERENCES videos(id) ON DELETE CASCADE;

-- Step 2: Drop old unique constraint (users_id, aspect_ratio, period_start)
-- and replace with per-video constraint (users_id, video_id, aspect_ratio)
ALTER TABLE thumbnail_usage
DROP CONSTRAINT IF EXISTS thumbnail_usage_users_id_aspect_ratio_period_start_key;

-- Add new per-video unique constraint
-- NULL video_id rows (legacy) won't conflict due to PostgreSQL NULL uniqueness rules
ALTER TABLE thumbnail_usage
ADD CONSTRAINT thumbnail_usage_users_id_video_id_aspect_ratio_key
UNIQUE (users_id, video_id, aspect_ratio);

-- Step 3: Add index for fast per-video lookups
CREATE INDEX IF NOT EXISTS idx_thumbnail_usage_video_aspect
ON thumbnail_usage(video_id, aspect_ratio);

-- Step 4: Update tier limits - reset_monthly is no longer relevant for per-video limits
UPDATE thumbnail_tier_limits SET reset_monthly = FALSE, updated_at = CURRENT_TIMESTAMP;

-- Comments
COMMENT ON COLUMN thumbnail_usage.video_id IS 'Video this usage is tracked against. NULL = legacy monthly-tracking rows.';
