-- Migration: Fix Free Users Missing Subscription Records
-- Description: Creates subscription and usage records for free tier users who are missing them
-- This fixes the bug where OAuth users could import unlimited videos
--
-- Run this migration to backfill subscription records for existing users

-- Step 1: Create user_subscriptions records for free users who don't have any
INSERT INTO user_subscriptions (
    users_id,
    stripe_subscription_id,
    plan_name,
    status,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
)
SELECT
    u.id,
    NULL,
    'Free',
    'active',
    DATE_TRUNC('month', CURRENT_DATE),
    DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month',
    NOW(),
    NOW()
FROM users u
LEFT JOIN user_subscriptions us ON u.id = us.users_id
WHERE us.id IS NULL
  AND u.subscription_tier = 'free'
  AND u.status = 'active'
  AND u.email_verified = TRUE;

-- Step 2: Create subscription_usage records for free users who have subscriptions but no usage records
INSERT INTO subscription_usage (
    user_id,
    user_subscriptions_id,
    usage_type,
    usage_limit,
    videos_processed,
    api_calls_made,
    storage_used_mb,
    ai_summaries_generated,
    analytics_views,
    period_start,
    period_end,
    reset_date,
    created_at,
    updated_at
)
SELECT
    u.id,
    us.id,
    'monthly',
    1,  -- Free tier gets 1 video
    0,
    0,
    0,
    0,
    0,
    DATE_TRUNC('month', CURRENT_DATE),
    DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month',
    DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month',
    NOW(),
    NOW()
FROM users u
JOIN user_subscriptions us ON u.id = us.users_id
LEFT JOIN subscription_usage su ON us.id = su.user_subscriptions_id
WHERE su.id IS NULL
  AND u.subscription_tier = 'free'
  AND u.status = 'active'
  AND u.email_verified = TRUE;

-- Verification query (run after migration to confirm):
-- SELECT
--     u.id,
--     u.email,
--     u.registration_method,
--     us.id as subscription_id,
--     su.id as usage_id,
--     su.usage_limit,
--     su.videos_processed
-- FROM users u
-- LEFT JOIN user_subscriptions us ON u.id = us.users_id
-- LEFT JOIN subscription_usage su ON us.id = su.user_subscriptions_id
-- WHERE u.subscription_tier = 'free'
--   AND u.status = 'active'
--   AND u.email_verified = TRUE
-- ORDER BY u.created_at DESC;
