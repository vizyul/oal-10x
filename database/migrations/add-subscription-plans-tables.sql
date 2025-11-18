-- =====================================================================
-- SUBSCRIPTION PLANS DATABASE SCHEMA
-- =====================================================================
-- This migration creates database tables to manage subscription plans,
-- replacing hardcoded tier definitions in stripe.config.js
--
-- Design Goals:
-- 1. Store all subscription tier configurations in database
-- 2. Enable runtime plan changes without code deployment
-- 3. Support A/B testing with multiple plan variations
-- 4. Track plan version history for analytics
-- 5. Support multi-currency pricing
-- =====================================================================

-- =====================================================================
-- Table: subscription_plans
-- Purpose: Master table for all subscription tiers/plans
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY,

    -- Plan Identity
    plan_key VARCHAR(50) NOT NULL UNIQUE,          -- 'free', 'basic', 'premium', 'creator', 'enterprise'
    plan_name VARCHAR(100) NOT NULL,               -- 'Basic Plan', 'Premium Plan', etc.
    plan_slug VARCHAR(100) NOT NULL UNIQUE,        -- URL-friendly: 'basic-plan'

    -- Status & Visibility
    is_active BOOLEAN NOT NULL DEFAULT true,       -- Can new users subscribe?
    is_visible BOOLEAN NOT NULL DEFAULT true,      -- Show on pricing page?
    is_legacy BOOLEAN NOT NULL DEFAULT false,      -- Grandfathered plan (no new subs)

    -- Display Order
    sort_order INTEGER NOT NULL DEFAULT 0,         -- Display order on pricing page

    -- Plan Description
    description TEXT,                              -- Marketing description
    features JSONB,                                -- Array of feature bullet points

    -- Resource Limits (denormalized for performance - also in subscription_plan_features)
    video_limit INTEGER DEFAULT 0,                 -- Monthly video processing limit (-1 = unlimited)
    api_calls_limit INTEGER DEFAULT 0,             -- Monthly API calls limit (-1 = unlimited)
    storage_limit INTEGER DEFAULT 0,               -- Storage limit in GB (-1 = unlimited)

    -- Metadata
    metadata JSONB,                                -- Additional flexible data

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE            -- Soft delete support
);

-- Index for active plan lookups
CREATE INDEX idx_subscription_plans_active ON subscription_plans(is_active) WHERE is_active = true;
CREATE INDEX idx_subscription_plans_visible ON subscription_plans(is_visible) WHERE is_visible = true;

-- =====================================================================
-- Table: subscription_plan_prices
-- Purpose: Pricing for each plan (supports monthly/yearly/custom)
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscription_plan_prices (
    id SERIAL PRIMARY KEY,

    -- Relationship
    subscription_plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,

    -- Stripe Integration
    stripe_price_id VARCHAR(100) NOT NULL UNIQUE,  -- Stripe Price ID (e.g., 'price_XXX')
    stripe_product_id VARCHAR(100),                -- Stripe Product ID (e.g., 'prod_XXX')

    -- Pricing Details
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',    -- ISO 4217 currency code
    amount INTEGER NOT NULL,                       -- Amount in cents (e.g., 3900 = $39.00)
    billing_period VARCHAR(20) NOT NULL,           -- 'month', 'year', 'week', 'day'
    billing_interval INTEGER NOT NULL DEFAULT 1,   -- How many periods (e.g., 1 month, 3 months)

    -- Display Pricing
    display_price DECIMAL(10, 2),                  -- Calculated display price (e.g., 39.00)
    monthly_equivalent DECIMAL(10, 2),             -- For yearly plans, show monthly cost
    original_monthly_total DECIMAL(10, 2),         -- Original monthly total (for savings calc)
    savings_amount DECIMAL(10, 2),                 -- Amount saved vs monthly

    -- Trial Configuration
    trial_period_days INTEGER DEFAULT 0,           -- Free trial length in days

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,       -- Can users subscribe to this price?
    is_default BOOLEAN NOT NULL DEFAULT false,     -- Default price for this plan

    -- Metadata
    metadata JSONB,                                -- Additional flexible data

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP WITH TIME ZONE           -- Archive old prices (keep for history)
);

-- Indexes
CREATE INDEX idx_plan_prices_plan_id ON subscription_plan_prices(subscription_plan_id);
CREATE INDEX idx_plan_prices_stripe_price ON subscription_plan_prices(stripe_price_id);
CREATE INDEX idx_plan_prices_active ON subscription_plan_prices(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX idx_plan_prices_default ON subscription_plan_prices(subscription_plan_id, is_default)
    WHERE is_default = true;

-- =====================================================================
-- Table: subscription_plan_features
-- Purpose: Feature limits and capabilities for each plan
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscription_plan_features (
    id SERIAL PRIMARY KEY,

    -- Relationship
    subscription_plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,

    -- Video Processing Limits
    video_limit INTEGER NOT NULL DEFAULT 0,        -- Monthly video processing limit (-1 = unlimited)
    storage_limit_gb INTEGER DEFAULT 0,            -- Storage limit in GB (-1 = unlimited)

    -- API Access
    api_access BOOLEAN NOT NULL DEFAULT false,     -- Can access API?
    api_calls_per_month INTEGER DEFAULT 0,         -- API call limit (-1 = unlimited)
    api_rate_limit INTEGER DEFAULT 60,             -- Requests per minute

    -- Analytics & Reporting
    analytics_access BOOLEAN NOT NULL DEFAULT false,
    advanced_analytics BOOLEAN NOT NULL DEFAULT false,

    -- Content Generation Features
    transcript_access BOOLEAN NOT NULL DEFAULT true,
    summary_access BOOLEAN NOT NULL DEFAULT true,
    chapters_access BOOLEAN NOT NULL DEFAULT false,
    blog_post_access BOOLEAN NOT NULL DEFAULT false,
    podcast_script_access BOOLEAN NOT NULL DEFAULT false,
    social_posts_access BOOLEAN NOT NULL DEFAULT false,
    social_posts_count INTEGER DEFAULT 0,          -- Number of social posts per video
    discussion_guide_access BOOLEAN NOT NULL DEFAULT false,
    quiz_access BOOLEAN NOT NULL DEFAULT false,
    quotes_access BOOLEAN NOT NULL DEFAULT false,
    slide_deck_access BOOLEAN NOT NULL DEFAULT false,
    ebook_access BOOLEAN NOT NULL DEFAULT false,
    linkedin_article_access BOOLEAN NOT NULL DEFAULT false,
    newsletter_access BOOLEAN NOT NULL DEFAULT false,
    marketing_funnel_access BOOLEAN NOT NULL DEFAULT false,
    study_guide_access BOOLEAN NOT NULL DEFAULT false,
    social_carousel_access BOOLEAN NOT NULL DEFAULT false,
    group_chat_guide_access BOOLEAN NOT NULL DEFAULT false,

    -- YouTube Integration
    youtube_auto_update BOOLEAN NOT NULL DEFAULT false,  -- Auto-update YT video with summary/chapters
    youtube_channel_limit INTEGER DEFAULT 1,       -- Number of channels user can connect

    -- Support & Priority
    support_level VARCHAR(50) DEFAULT 'email',     -- 'email', 'priority', 'dedicated'
    priority_processing BOOLEAN NOT NULL DEFAULT false,

    -- Team & Collaboration
    team_members INTEGER DEFAULT 1,                -- Number of team seats
    shared_workspace BOOLEAN NOT NULL DEFAULT false,

    -- Branding
    white_label BOOLEAN NOT NULL DEFAULT false,    -- Remove "Our AI Legacy" branding
    custom_domain BOOLEAN NOT NULL DEFAULT false,

    -- Metadata
    metadata JSONB,                                -- Additional flexible features

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX idx_plan_features_plan_id ON subscription_plan_features(subscription_plan_id);
CREATE UNIQUE INDEX idx_plan_features_unique_plan ON subscription_plan_features(subscription_plan_id);

-- =====================================================================
-- Table: subscription_plan_version_history
-- Purpose: Track changes to plans over time for analytics and auditing
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscription_plan_version_history (
    id SERIAL PRIMARY KEY,

    -- Relationship
    subscription_plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,

    -- Version Info
    version_number INTEGER NOT NULL,               -- Incremental version (1, 2, 3...)
    changed_by_user_id INTEGER,                    -- Admin who made the change
    change_reason TEXT,                            -- Why was this changed?

    -- Snapshot of Plan Data
    plan_snapshot JSONB NOT NULL,                  -- Complete plan state at this version
    features_snapshot JSONB,                       -- Features state at this version
    prices_snapshot JSONB,                         -- Prices state at this version

    -- Change Tracking
    fields_changed TEXT[],                         -- Array of changed field names

    -- Timestamps
    version_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX idx_plan_version_plan_id ON subscription_plan_version_history(subscription_plan_id);
CREATE INDEX idx_plan_version_date ON subscription_plan_version_history(version_date DESC);

-- =====================================================================
-- Table: subscription_plan_migrations (Links users to plan transitions)
-- Purpose: Track when users upgrade/downgrade between plans
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscription_plan_migrations (
    id SERIAL PRIMARY KEY,

    -- User & Subscription
    users_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_subscriptions_id INTEGER REFERENCES user_subscriptions(id) ON DELETE SET NULL,

    -- Plan Change
    from_plan_id INTEGER REFERENCES subscription_plans(id) ON DELETE SET NULL,
    to_plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,

    -- Migration Details
    migration_type VARCHAR(50) NOT NULL,           -- 'upgrade', 'downgrade', 'crossgrade', 'new', 'cancellation'
    migration_reason VARCHAR(100),                 -- 'user_initiated', 'admin', 'trial_ended', 'payment_failed'
    effective_date TIMESTAMP WITH TIME ZONE,       -- When change takes effect
    is_prorated BOOLEAN DEFAULT true,              -- Was prorated billing applied?
    proration_amount INTEGER,                      -- Prorated amount in cents

    -- Stripe Integration
    stripe_subscription_id VARCHAR(100),           -- Stripe subscription ID
    stripe_invoice_id VARCHAR(100),                -- Invoice for this change

    -- Status
    status VARCHAR(50) DEFAULT 'pending',          -- 'pending', 'completed', 'failed', 'scheduled'
    completed_at TIMESTAMP WITH TIME ZONE,         -- When migration completed

    -- Metadata
    metadata JSONB,                                -- Additional data (e.g., campaign tracking)

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_plan_migrations_user ON subscription_plan_migrations(users_id);
CREATE INDEX idx_plan_migrations_subscription ON subscription_plan_migrations(user_subscriptions_id);
CREATE INDEX idx_plan_migrations_type ON subscription_plan_migrations(migration_type);
CREATE INDEX idx_plan_migrations_status ON subscription_plan_migrations(status);
CREATE INDEX idx_plan_migrations_created ON subscription_plan_migrations(created_at DESC);

-- =====================================================================
-- SEED DATA: Initial subscription plans
-- =====================================================================

-- Insert base plans
INSERT INTO subscription_plans (plan_key, plan_name, plan_slug, is_active, is_visible, sort_order, description, features, video_limit, api_calls_limit, storage_limit) VALUES
('free', 'Free', 'free', true, true, 1, 'Try Our AI Legacy with 1 free video',
 '["1 free video", "All CREATOR Content Types", "Priority Support", "Dedicated Account Manager", "Custom Integration", "Team Collaboration"]'::jsonb,
 1, 0, 1),

('basic', 'Basic', 'basic', true, true, 2, 'Perfect for individuals getting started',
 '["4 videos/month", "Video Transcript", "SEO Optimized Summary", "Video Chapters", "20 Social Media Posts", "Email Support"]'::jsonb,
 4, 0, 5),

('premium', 'Premium', 'premium', true, true, 3, 'Advanced features for content creators',
 '["8 videos/month", "All BASIC Content Types", "Auto-update YouTube Video with Summary & Chapters", "Slide Deck", "E-Book", "LinkedIn Article", "Marketing Funnel Playbook", "Newsletter"]'::jsonb,
 8, 1000, 10),

('creator', 'Creator', 'creator', true, true, 4, 'Comprehensive toolkit for professional creators',
 '["16 videos/month", "All PREMIUM Content Types", "Blog Post", "Podcast Script", "Study Guide", "Discussion Guide", "Quiz", "Quotes", "Social Carousel", "Group Chat Guide"]'::jsonb,
 16, 5000, 25),

('enterprise', 'Enterprise', 'enterprise', true, true, 5, 'Maximum capacity for teams and organizations',
 '["50 videos/month", "All CREATOR Content Types", "Priority Support", "Dedicated Account Manager", "Custom Integration", "Team Collaboration"]'::jsonb,
 50, -1, -1);

-- Insert plan features
INSERT INTO subscription_plan_features (
    subscription_plan_id, video_limit, api_access, analytics_access,
    transcript_access, summary_access, chapters_access, blog_post_access,
    podcast_script_access, social_posts_access, social_posts_count,
    discussion_guide_access, quiz_access, quotes_access,
    slide_deck_access, ebook_access, linkedin_article_access,
    newsletter_access, marketing_funnel_access, study_guide_access,
    social_carousel_access, group_chat_guide_access, youtube_auto_update,
    support_level, priority_processing
) VALUES
-- Free tier
(1, 1, false, false, true, true, true, true, true, true, 20, true, true, true, true, true, true, true, true, true, true, true, true, 'email', false),

-- Basic tier
(2, 4, false, false, true, true, true, false, false, true, 20, false, false, false, false, false, false, false, false, false, false, false, false, 'email', false),

-- Premium tier
(3, 8, false, true, true, true, true, false, false, true, 20, false, false, false, true, true, true, true, true, false, false, false, true, 'priority', false),

-- Creator tier
(4, 16, true, true, true, true, true, true, true, true, 20, true, true, true, true, true, true, true, true, true, true, true, true, 'priority', true),

-- Enterprise tier
(5, 50, true, true, true, true, true, true, true, true, 20, true, true, true, true, true, true, true, true, true, true, true, true, 'dedicated', true);

-- NOTE: Stripe price IDs should be added via separate data migration or API
-- INSERT INTO subscription_plan_prices (subscription_plan_id, stripe_price_id, currency, amount, billing_period, display_price, is_active, is_default)
-- SELECT id, 'price_XXX', 'usd', 3900, 'month', 39.00, true, true
-- FROM subscription_plans WHERE plan_key = 'basic';

-- =====================================================================
-- TRIGGERS: Auto-update timestamps
-- =====================================================================

CREATE OR REPLACE FUNCTION update_subscription_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_plans_updated_at();

CREATE TRIGGER trigger_subscription_plan_prices_updated_at
    BEFORE UPDATE ON subscription_plan_prices
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_plans_updated_at();

CREATE TRIGGER trigger_subscription_plan_features_updated_at
    BEFORE UPDATE ON subscription_plan_features
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_plans_updated_at();

CREATE TRIGGER trigger_subscription_plan_migrations_updated_at
    BEFORE UPDATE ON subscription_plan_migrations
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_plans_updated_at();

-- =====================================================================
-- VIEWS: Convenience views for common queries
-- =====================================================================

-- Complete plan details (plan + features + prices)
CREATE OR REPLACE VIEW vw_subscription_plans_complete AS
SELECT
    sp.id,
    sp.plan_key,
    sp.plan_name,
    sp.plan_slug,
    sp.is_active,
    sp.is_visible,
    sp.is_legacy,
    sp.sort_order,
    sp.description,
    sp.features,
    spf.video_limit,
    spf.api_access,
    spf.analytics_access,
    spf.support_level,
    spf.priority_processing,
    -- Aggregate prices
    json_agg(
        json_build_object(
            'price_id', spp.id,
            'stripe_price_id', spp.stripe_price_id,
            'currency', spp.currency,
            'amount', spp.amount,
            'billing_period', spp.billing_period,
            'display_price', spp.display_price,
            'monthly_equivalent', spp.monthly_equivalent,
            'savings_amount', spp.savings_amount,
            'is_default', spp.is_default,
            'is_active', spp.is_active
        ) ORDER BY spp.billing_period, spp.amount
    ) FILTER (WHERE spp.id IS NOT NULL) AS prices
FROM subscription_plans sp
LEFT JOIN subscription_plan_features spf ON sp.id = spf.subscription_plan_id
LEFT JOIN subscription_plan_prices spp ON sp.id = spp.subscription_plan_id AND spp.is_active = true
WHERE sp.deleted_at IS NULL
GROUP BY sp.id, sp.plan_key, sp.plan_name, sp.plan_slug, sp.is_active, sp.is_visible,
         sp.is_legacy, sp.sort_order, sp.description, sp.features,
         spf.video_limit, spf.api_access, spf.analytics_access, spf.support_level, spf.priority_processing
ORDER BY sp.sort_order;

-- Active subscription plans for pricing page
CREATE OR REPLACE VIEW vw_active_subscription_plans AS
SELECT * FROM vw_subscription_plans_complete
WHERE is_active = true AND is_visible = true
ORDER BY sort_order;

-- =====================================================================
-- HELPER FUNCTIONS
-- =====================================================================

-- Function to get plan by key
CREATE OR REPLACE FUNCTION get_subscription_plan_by_key(plan_key_param VARCHAR)
RETURNS TABLE (
    id INTEGER,
    plan_key VARCHAR,
    plan_name VARCHAR,
    video_limit INTEGER,
    api_access BOOLEAN,
    analytics_access BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sp.id,
        sp.plan_key,
        sp.plan_name,
        spf.video_limit,
        spf.api_access,
        spf.analytics_access
    FROM subscription_plans sp
    LEFT JOIN subscription_plan_features spf ON sp.id = spf.subscription_plan_id
    WHERE sp.plan_key = plan_key_param
      AND sp.is_active = true
      AND sp.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to get plan features by Stripe price ID
CREATE OR REPLACE FUNCTION get_plan_features_by_stripe_price(stripe_price_id_param VARCHAR)
RETURNS TABLE (
    plan_key VARCHAR,
    plan_name VARCHAR,
    video_limit INTEGER,
    api_access BOOLEAN,
    features JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sp.plan_key,
        sp.plan_name,
        spf.video_limit,
        spf.api_access,
        spf.metadata AS features
    FROM subscription_plan_prices spp
    JOIN subscription_plans sp ON spp.subscription_plan_id = sp.id
    LEFT JOIN subscription_plan_features spf ON sp.id = spf.subscription_plan_id
    WHERE spp.stripe_price_id = stripe_price_id_param
      AND spp.is_active = true;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================================

COMMENT ON TABLE subscription_plans IS 'Master table for subscription tiers/plans';
COMMENT ON TABLE subscription_plan_prices IS 'Pricing options for each plan (monthly/yearly)';
COMMENT ON TABLE subscription_plan_features IS 'Feature limits and capabilities for each plan';
COMMENT ON TABLE subscription_plan_version_history IS 'Audit trail of plan changes over time';
COMMENT ON TABLE subscription_plan_migrations IS 'Track user upgrades/downgrades between plans';

COMMENT ON COLUMN subscription_plans.plan_key IS 'Unique identifier for code references (free, basic, premium, creator, enterprise)';
COMMENT ON COLUMN subscription_plan_features.video_limit IS 'Monthly video processing limit. Use -1 for unlimited';
COMMENT ON COLUMN subscription_plan_prices.amount IS 'Price in smallest currency unit (cents for USD)';

-- =====================================================================
-- MIGRATION NOTES
-- =====================================================================

-- To populate Stripe price IDs from environment variables, run:
-- UPDATE subscription_plan_prices SET stripe_price_id = 'price_XXX'
-- WHERE subscription_plan_id = (SELECT id FROM subscription_plans WHERE plan_key = 'basic')
--   AND billing_period = 'month';

-- =====================================================================
-- END OF MIGRATION
-- =====================================================================
