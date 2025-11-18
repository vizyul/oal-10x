-- =====================================================================
-- Add Resource Limit Columns to subscription_plans Table
-- =====================================================================
-- This migration adds explicit limit columns to subscription_plans table
-- for easier querying without joining to subscription_plan_features
--
-- Date: 2025-11-13
-- Purpose: Support database-driven subscription limits
-- =====================================================================

-- Add new columns to subscription_plans table
ALTER TABLE subscription_plans
ADD COLUMN IF NOT EXISTS video_limit INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS api_calls_limit INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS storage_limit INTEGER DEFAULT 0;

-- Add comments to document the columns
COMMENT ON COLUMN subscription_plans.video_limit IS 'Monthly video processing limit. Use -1 for unlimited';
COMMENT ON COLUMN subscription_plans.api_calls_limit IS 'Monthly API calls limit. Use -1 for unlimited';
COMMENT ON COLUMN subscription_plans.storage_limit IS 'Storage limit in GB. Use -1 for unlimited';

-- Update existing plans with their limits
UPDATE subscription_plans SET video_limit = 1, api_calls_limit = 0, storage_limit = 1 WHERE plan_key = 'free';
UPDATE subscription_plans SET video_limit = 4, api_calls_limit = 0, storage_limit = 5 WHERE plan_key = 'basic';
UPDATE subscription_plans SET video_limit = 8, api_calls_limit = 1000, storage_limit = 10 WHERE plan_key = 'premium';
UPDATE subscription_plans SET video_limit = 16, api_calls_limit = 5000, storage_limit = 25 WHERE plan_key = 'creator';
UPDATE subscription_plans SET video_limit = 50, api_calls_limit = -1, storage_limit = -1 WHERE plan_key = 'enterprise';

-- Verify the updates
SELECT plan_key, plan_name, video_limit, api_calls_limit, storage_limit
FROM subscription_plans
ORDER BY sort_order;

-- =====================================================================
-- END OF MIGRATION
-- =====================================================================
