-- =====================================================================
-- SUBSCRIPTION PLANS DATABASE SCHEMA - PRODUCTION SAFE VERSION
-- =====================================================================
-- This is a fully idempotent version that can be run multiple times safely
-- =====================================================================

-- Pre-flight check: Verify users table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
        RAISE EXCEPTION 'users table does not exist. Cannot create foreign key constraints.';
    END IF;
END $$;

-- =====================================================================
-- Table: subscription_plans
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY,
    plan_key VARCHAR(50) NOT NULL UNIQUE,
    plan_name VARCHAR(100) NOT NULL,
    plan_slug VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    is_legacy BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    features JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_subscription_plans_visible ON subscription_plans(is_visible) WHERE is_visible = true;

-- =====================================================================
-- Table: subscription_plan_prices
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscription_plan_prices (
    id SERIAL PRIMARY KEY,
    subscription_plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    stripe_price_id VARCHAR(100) NOT NULL UNIQUE,
    stripe_product_id VARCHAR(100),
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    amount INTEGER NOT NULL,
    billing_period VARCHAR(20) NOT NULL,
    billing_interval INTEGER NOT NULL DEFAULT 1,
    display_price DECIMAL(10, 2),
    monthly_equivalent DECIMAL(10, 2),
    original_monthly_total DECIMAL(10, 2),
    savings_amount DECIMAL(10, 2),
    trial_period_days INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_plan_prices_plan_id ON subscription_plan_prices(subscription_plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_prices_stripe_price ON subscription_plan_prices(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_plan_prices_active ON subscription_plan_prices(is_active) WHERE is_active = true;

-- Unique index for default prices (conditional)
DROP INDEX IF EXISTS idx_plan_prices_default;
CREATE UNIQUE INDEX idx_plan_prices_default ON subscription_plan_prices(subscription_plan_id, is_default)
    WHERE is_default = true;

-- =====================================================================
-- Table: subscription_plan_features
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscription_plan_features (
    id SERIAL PRIMARY KEY,
    subscription_plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    video_limit INTEGER NOT NULL DEFAULT 0,
    storage_limit_gb INTEGER DEFAULT 0,
    api_access BOOLEAN NOT NULL DEFAULT false,
    api_calls_per_month INTEGER DEFAULT 0,
    api_rate_limit INTEGER DEFAULT 60,
    analytics_access BOOLEAN NOT NULL DEFAULT false,
    advanced_analytics BOOLEAN NOT NULL DEFAULT false,
    transcript_access BOOLEAN NOT NULL DEFAULT true,
    summary_access BOOLEAN NOT NULL DEFAULT true,
    chapters_access BOOLEAN NOT NULL DEFAULT false,
    blog_post_access BOOLEAN NOT NULL DEFAULT false,
    podcast_script_access BOOLEAN NOT NULL DEFAULT false,
    social_posts_access BOOLEAN NOT NULL DEFAULT false,
    social_posts_count INTEGER DEFAULT 0,
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
    youtube_auto_update BOOLEAN NOT NULL DEFAULT false,
    youtube_channel_limit INTEGER DEFAULT 1,
    support_level VARCHAR(50) DEFAULT 'email',
    priority_processing BOOLEAN NOT NULL DEFAULT false,
    team_members INTEGER DEFAULT 1,
    shared_workspace BOOLEAN NOT NULL DEFAULT false,
    white_label BOOLEAN NOT NULL DEFAULT false,
    custom_domain BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plan_features_plan_id ON subscription_plan_features(subscription_plan_id);

-- Unique constraint for features (one feature set per plan)
DROP INDEX IF EXISTS idx_plan_features_unique_plan;
CREATE UNIQUE INDEX idx_plan_features_unique_plan ON subscription_plan_features(subscription_plan_id);

-- =====================================================================
-- Table: subscription_plan_version_history
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscription_plan_version_history (
    id SERIAL PRIMARY KEY,
    subscription_plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    changed_by_user_id INTEGER,
    change_reason TEXT,
    plan_snapshot JSONB NOT NULL,
    features_snapshot JSONB,
    prices_snapshot JSONB,
    fields_changed TEXT[],
    version_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plan_version_plan_id ON subscription_plan_version_history(subscription_plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_version_date ON subscription_plan_version_history(version_date DESC);

-- =====================================================================
-- Table: subscription_plan_migrations
-- =====================================================================
CREATE TABLE IF NOT EXISTS subscription_plan_migrations (
    id SERIAL PRIMARY KEY,
    users_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_subscriptions_id INTEGER REFERENCES user_subscriptions(id) ON DELETE SET NULL,
    from_plan_id INTEGER REFERENCES subscription_plans(id) ON DELETE SET NULL,
    to_plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    migration_type VARCHAR(50) NOT NULL,
    migration_reason VARCHAR(100),
    effective_date TIMESTAMP WITH TIME ZONE,
    is_prorated BOOLEAN DEFAULT true,
    proration_amount INTEGER,
    stripe_subscription_id VARCHAR(100),
    stripe_invoice_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plan_migrations_user ON subscription_plan_migrations(users_id);
CREATE INDEX IF NOT EXISTS idx_plan_migrations_subscription ON subscription_plan_migrations(user_subscriptions_id);
CREATE INDEX IF NOT EXISTS idx_plan_migrations_type ON subscription_plan_migrations(migration_type);
CREATE INDEX IF NOT EXISTS idx_plan_migrations_status ON subscription_plan_migrations(status);
CREATE INDEX IF NOT EXISTS idx_plan_migrations_created ON subscription_plan_migrations(created_at DESC);

-- =====================================================================
-- SEED DATA: Initial subscription plans (IDEMPOTENT)
-- =====================================================================

-- Insert base plans (ON CONFLICT = safe for re-runs)
INSERT INTO subscription_plans (plan_key, plan_name, plan_slug, is_active, is_visible, sort_order, description, features)
VALUES
('free', 'Free', 'free', true, true, 1, 'Try AmplifyContent.ai with 1 free video',
 '["1 free video", "Basic AI summaries", "Community support"]'::jsonb)
ON CONFLICT (plan_key) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    description = EXCLUDED.description,
    features = EXCLUDED.features,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO subscription_plans (plan_key, plan_name, plan_slug, is_active, is_visible, sort_order, description, features)
VALUES
('basic', 'Basic', 'basic', true, true, 2, 'Perfect for individuals getting started',
 '["4 videos/month", "Video Transcript", "SEO Optimized Summary", "Video Chapters", "20 Social Media Posts", "Email Support"]'::jsonb)
ON CONFLICT (plan_key) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    description = EXCLUDED.description,
    features = EXCLUDED.features,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO subscription_plans (plan_key, plan_name, plan_slug, is_active, is_visible, sort_order, description, features)
VALUES
('premium', 'Premium', 'premium', true, true, 3, 'Advanced features for content creators',
 '["8 videos/month", "All BASIC Content Types", "Auto-update YouTube Video with Summary & Chapters", "Slide Deck", "E-Book", "LinkedIn Article", "Marketing Funnel Playbook", "Newsletter"]'::jsonb)
ON CONFLICT (plan_key) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    description = EXCLUDED.description,
    features = EXCLUDED.features,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO subscription_plans (plan_key, plan_name, plan_slug, is_active, is_visible, sort_order, description, features)
VALUES
('creator', 'Creator', 'creator', true, true, 4, 'Comprehensive toolkit for professional creators',
 '["16 videos/month", "All PREMIUM Content Types", "Blog Post", "Podcast Script", "Study Guide", "Discussion Guide", "Quiz", "Quotes", "Social Carousel", "Group Chat Guide"]'::jsonb)
ON CONFLICT (plan_key) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    description = EXCLUDED.description,
    features = EXCLUDED.features,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO subscription_plans (plan_key, plan_name, plan_slug, is_active, is_visible, sort_order, description, features)
VALUES
('enterprise', 'Enterprise', 'enterprise', true, true, 5, 'Maximum capacity for teams and organizations',
 '["50 videos/month", "All CREATOR Content Types", "Priority Support", "Dedicated Account Manager", "Custom Integration", "Team Collaboration"]'::jsonb)
ON CONFLICT (plan_key) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    description = EXCLUDED.description,
    features = EXCLUDED.features,
    updated_at = CURRENT_TIMESTAMP;

-- Insert plan features (IDEMPOTENT with DO NOTHING)
INSERT INTO subscription_plan_features (
    subscription_plan_id, video_limit, api_access, analytics_access,
    transcript_access, summary_access, chapters_access, blog_post_access,
    podcast_script_access, social_posts_access, social_posts_count,
    discussion_guide_access, quiz_access, quotes_access,
    slide_deck_access, ebook_access, linkedin_article_access,
    newsletter_access, marketing_funnel_access, study_guide_access,
    social_carousel_access, group_chat_guide_access, youtube_auto_update,
    support_level, priority_processing
)
SELECT
    sp.id, 1, false, false, true, true, false, false, false, false, 0,
    false, false, false, false, false, false, false, false, false, false, false,
    false, 'email', false
FROM subscription_plans sp
WHERE sp.plan_key = 'free'
ON CONFLICT (subscription_plan_id) DO NOTHING;

INSERT INTO subscription_plan_features (
    subscription_plan_id, video_limit, api_access, analytics_access,
    transcript_access, summary_access, chapters_access, blog_post_access,
    podcast_script_access, social_posts_access, social_posts_count,
    discussion_guide_access, quiz_access, quotes_access,
    slide_deck_access, ebook_access, linkedin_article_access,
    newsletter_access, marketing_funnel_access, study_guide_access,
    social_carousel_access, group_chat_guide_access, youtube_auto_update,
    support_level, priority_processing
)
SELECT
    sp.id, 4, false, false, true, true, true, false, false, true, 20,
    false, false, false, false, false, false, false, false, false, false, false,
    false, 'email', false
FROM subscription_plans sp
WHERE sp.plan_key = 'basic'
ON CONFLICT (subscription_plan_id) DO NOTHING;

INSERT INTO subscription_plan_features (
    subscription_plan_id, video_limit, api_access, analytics_access,
    transcript_access, summary_access, chapters_access, blog_post_access,
    podcast_script_access, social_posts_access, social_posts_count,
    discussion_guide_access, quiz_access, quotes_access,
    slide_deck_access, ebook_access, linkedin_article_access,
    newsletter_access, marketing_funnel_access, study_guide_access,
    social_carousel_access, group_chat_guide_access, youtube_auto_update,
    support_level, priority_processing
)
SELECT
    sp.id, 8, false, true, true, true, true, false, false, true, 20,
    false, false, false, true, true, true, true, true, false, false, false,
    true, 'priority', false
FROM subscription_plans sp
WHERE sp.plan_key = 'premium'
ON CONFLICT (subscription_plan_id) DO NOTHING;

INSERT INTO subscription_plan_features (
    subscription_plan_id, video_limit, api_access, analytics_access,
    transcript_access, summary_access, chapters_access, blog_post_access,
    podcast_script_access, social_posts_access, social_posts_count,
    discussion_guide_access, quiz_access, quotes_access,
    slide_deck_access, ebook_access, linkedin_article_access,
    newsletter_access, marketing_funnel_access, study_guide_access,
    social_carousel_access, group_chat_guide_access, youtube_auto_update,
    support_level, priority_processing
)
SELECT
    sp.id, 16, true, true, true, true, true, true, true, true, 20,
    true, true, true, true, true, true, true, true, true, true, true,
    true, 'priority', true
FROM subscription_plans sp
WHERE sp.plan_key = 'creator'
ON CONFLICT (subscription_plan_id) DO NOTHING;

INSERT INTO subscription_plan_features (
    subscription_plan_id, video_limit, api_access, analytics_access,
    transcript_access, summary_access, chapters_access, blog_post_access,
    podcast_script_access, social_posts_access, social_posts_count,
    discussion_guide_access, quiz_access, quotes_access,
    slide_deck_access, ebook_access, linkedin_article_access,
    newsletter_access, marketing_funnel_access, study_guide_access,
    social_carousel_access, group_chat_guide_access, youtube_auto_update,
    support_level, priority_processing
)
SELECT
    sp.id, 50, true, true, true, true, true, true, true, true, 20,
    true, true, true, true, true, true, true, true, true, true, true,
    true, 'dedicated', true
FROM subscription_plans sp
WHERE sp.plan_key = 'enterprise'
ON CONFLICT (subscription_plan_id) DO NOTHING;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

CREATE OR REPLACE FUNCTION update_subscription_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER trigger_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_plans_updated_at();

DROP TRIGGER IF EXISTS trigger_subscription_plan_prices_updated_at ON subscription_plan_prices;
CREATE TRIGGER trigger_subscription_plan_prices_updated_at
    BEFORE UPDATE ON subscription_plan_prices
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_plans_updated_at();

DROP TRIGGER IF EXISTS trigger_subscription_plan_features_updated_at ON subscription_plan_features;
CREATE TRIGGER trigger_subscription_plan_features_updated_at
    BEFORE UPDATE ON subscription_plan_features
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_plans_updated_at();

DROP TRIGGER IF EXISTS trigger_subscription_plan_migrations_updated_at ON subscription_plan_migrations;
CREATE TRIGGER trigger_subscription_plan_migrations_updated_at
    BEFORE UPDATE ON subscription_plan_migrations
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_plans_updated_at();

-- =====================================================================
-- VIEWS
-- =====================================================================

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

CREATE OR REPLACE VIEW vw_active_subscription_plans AS
SELECT * FROM vw_subscription_plans_complete
WHERE is_active = true AND is_visible = true
ORDER BY sort_order;

-- =====================================================================
-- HELPER FUNCTIONS
-- =====================================================================

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
-- COMMENTS
-- =====================================================================

COMMENT ON TABLE subscription_plans IS 'Master table for subscription tiers/plans';
COMMENT ON TABLE subscription_plan_prices IS 'Pricing options for each plan (monthly/yearly)';
COMMENT ON TABLE subscription_plan_features IS 'Feature limits and capabilities for each plan';
COMMENT ON TABLE subscription_plan_version_history IS 'Audit trail of plan changes over time';
COMMENT ON TABLE subscription_plan_migrations IS 'Track user upgrades/downgrades between plans';

-- =====================================================================
-- SUCCESS MESSAGE
-- =====================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Subscription plans tables created successfully!';
    RAISE NOTICE '📊 Seed data populated for 5 tiers: free, basic, premium, creator, enterprise';
    RAISE NOTICE '🔍 Run this to verify: SELECT * FROM vw_active_subscription_plans;';
END $$;
