-- Migration: Add thumbnail counts to subscription_plans.features JSONB
-- Aligns database features with stripe.config.js (source of truth for upgrade page)
-- Affects: /subscription/success page and upgrade emails

-- Free tier
UPDATE subscription_plans SET features = '["1 free video", "8 Thumbnails/video", "Basic AI summaries", "Community support"]'::jsonb WHERE plan_key = 'free';

-- Basic tier
UPDATE subscription_plans SET features = '["4 videos/month", "96 Thumbnails/month", "Video Transcript", "SEO Optimized Summary", "Video Chapters", "20 Social Media Posts", "Email Support"]'::jsonb WHERE plan_key = 'basic';

-- Premium tier
UPDATE subscription_plans SET features = '["8 videos/month", "640 Thumbnails/month", "All BASIC Content Types", "Auto-update YouTube Video with Summary & Chapters", "Slide Deck", "E-Book", "LinkedIn Article", "Marketing Funnel Playbook", "Newsletter"]'::jsonb WHERE plan_key = 'premium';

-- Creator tier
UPDATE subscription_plans SET features = '["16 videos/month", "3,200 Thumbnails/month", "All PREMIUM Content Types", "Blog Post", "Podcast Script", "Study Guide", "Discussion Guide", "Quiz", "Quotes", "Social Carousel", "Group Chat Guide"]'::jsonb WHERE plan_key = 'creator';

-- Enterprise tier
UPDATE subscription_plans SET features = '["50 videos/month", "Unlimited Thumbnails", "All PREMIUM Content Types", "Blog Post", "Podcast Script", "Study Guide", "Discussion Guide", "Quiz", "Quotes", "Social Carousel", "Group Chat Guide"]'::jsonb WHERE plan_key = 'enterprise';
