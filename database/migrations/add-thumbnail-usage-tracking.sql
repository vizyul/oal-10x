-- Migration: Add thumbnail usage tracking for subscription-based limits
-- This table tracks how many thumbnail generation iterations each user has used
-- per aspect ratio, enabling subscription-tier-based limits

-- Table to track thumbnail generation usage per user
CREATE TABLE IF NOT EXISTS thumbnail_usage (
    id SERIAL PRIMARY KEY,
    users_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    aspect_ratio VARCHAR(10) NOT NULL DEFAULT '16:9',  -- '16:9' or '9:16'
    iterations_used INTEGER NOT NULL DEFAULT 0,
    thumbnails_generated INTEGER NOT NULL DEFAULT 0,   -- Total thumbnails (iterations * 4)
    period_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    period_end TIMESTAMP WITH TIME ZONE,               -- NULL = lifetime limit, set for monthly resets
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per user per aspect ratio per period
    UNIQUE(users_id, aspect_ratio, period_start)
);

-- Table to define thumbnail generation limits per subscription tier
CREATE TABLE IF NOT EXISTS thumbnail_tier_limits (
    id SERIAL PRIMARY KEY,
    subscription_tier VARCHAR(50) NOT NULL UNIQUE,
    iterations_16_9 INTEGER NOT NULL DEFAULT 1,        -- Max iterations for 16:9 thumbnails
    iterations_9_16 INTEGER NOT NULL DEFAULT 1,        -- Max iterations for 9:16 thumbnails
    is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,       -- If true, no limits apply
    reset_monthly BOOLEAN NOT NULL DEFAULT FALSE,      -- If true, limits reset each month
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default tier limits
INSERT INTO thumbnail_tier_limits (subscription_tier, iterations_16_9, iterations_9_16, is_unlimited, reset_monthly)
VALUES
    ('free', 1, 1, FALSE, FALSE),           -- Free: 1 iteration each, lifetime
    ('basic', 3, 3, FALSE, TRUE),           -- Basic: 3 iterations each per month
    ('premium', 10, 10, FALSE, TRUE),       -- Premium: 10 iterations each per month
    ('creator', 25, 25, FALSE, TRUE),       -- Creator: 25 iterations each per month
    ('enterprise', 0, 0, TRUE, FALSE)       -- Enterprise: Unlimited
ON CONFLICT (subscription_tier) DO UPDATE SET
    iterations_16_9 = EXCLUDED.iterations_16_9,
    iterations_9_16 = EXCLUDED.iterations_9_16,
    is_unlimited = EXCLUDED.is_unlimited,
    reset_monthly = EXCLUDED.reset_monthly,
    updated_at = CURRENT_TIMESTAMP;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_thumbnail_usage_user_aspect ON thumbnail_usage(users_id, aspect_ratio);
CREATE INDEX IF NOT EXISTS idx_thumbnail_usage_period ON thumbnail_usage(users_id, period_start, period_end);

-- Comments for documentation
COMMENT ON TABLE thumbnail_usage IS 'Tracks thumbnail generation iterations used per user and aspect ratio';
COMMENT ON TABLE thumbnail_tier_limits IS 'Defines thumbnail generation limits per subscription tier';
COMMENT ON COLUMN thumbnail_usage.iterations_used IS 'Number of generation batches (each batch = 4 thumbnails)';
COMMENT ON COLUMN thumbnail_tier_limits.reset_monthly IS 'If true, user usage resets at the start of each billing period';
