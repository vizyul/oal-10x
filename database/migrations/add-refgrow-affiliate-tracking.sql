-- RefGrow Affiliate Tracking Integration
-- Migration to add affiliate referral tracking tables and columns
-- Created: 2025-01-24

-- ============================================================================
-- 1. Create affiliate_referrals table
-- ============================================================================
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id SERIAL PRIMARY KEY,
  users_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refgrow_affiliate_id VARCHAR(255), -- RefGrow's affiliate ID
  refgrow_referral_id VARCHAR(255) UNIQUE, -- RefGrow's referral tracking ID
  referral_code VARCHAR(100) NOT NULL, -- Affiliate's unique referral code
  referral_source VARCHAR(255), -- UTM source or referral URL
  commission_amount DECIMAL(10,2) DEFAULT 0.00, -- Commission amount in USD
  commission_rate DECIMAL(5,2) DEFAULT 20.00, -- Commission percentage (e.g., 20.00 for 20%)
  commission_status VARCHAR(50) DEFAULT 'pending', -- pending, approved, paid, failed, cancelled
  stripe_subscription_id VARCHAR(255), -- Link to Stripe subscription
  referred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- When user clicked referral link
  converted_at TIMESTAMP, -- When they became paying customer
  paid_at TIMESTAMP, -- When commission was paid
  metadata JSONB, -- Additional RefGrow data
  notes TEXT, -- Admin notes
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. Add indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_users_id ON affiliate_referrals(users_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_refgrow_affiliate_id ON affiliate_referrals(refgrow_affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_referral_code ON affiliate_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_commission_status ON affiliate_referrals(commission_status);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_stripe_subscription_id ON affiliate_referrals(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_converted_at ON affiliate_referrals(converted_at);

-- ============================================================================
-- 3. Add affiliate tracking columns to users table
-- ============================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS refgrow_affiliate_id VARCHAR(255), -- If user is an affiliate
  ADD COLUMN IF NOT EXISTS affiliate_code VARCHAR(50) UNIQUE, -- User's unique affiliate/referral code
  ADD COLUMN IF NOT EXISTS referred_by_code VARCHAR(100), -- If user was referred by someone
  ADD COLUMN IF NOT EXISTS is_affiliate BOOLEAN DEFAULT FALSE, -- Is this user an affiliate?
  ADD COLUMN IF NOT EXISTS affiliate_status VARCHAR(50) DEFAULT 'inactive', -- inactive, pending, active, suspended
  ADD COLUMN IF NOT EXISTS affiliate_joined_at TIMESTAMP; -- When they became an affiliate

-- Add indexes for affiliate-related queries
CREATE INDEX IF NOT EXISTS idx_users_refgrow_affiliate_id ON users(refgrow_affiliate_id);
CREATE INDEX IF NOT EXISTS idx_users_affiliate_code ON users(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by_code ON users(referred_by_code);
CREATE INDEX IF NOT EXISTS idx_users_is_affiliate ON users(is_affiliate);

-- ============================================================================
-- 4. Add affiliate tracking to subscription_events table
-- ============================================================================
ALTER TABLE subscription_events
  ADD COLUMN IF NOT EXISTS affiliate_referral_id INTEGER REFERENCES affiliate_referrals(id);

CREATE INDEX IF NOT EXISTS idx_subscription_events_affiliate_referral_id ON subscription_events(affiliate_referral_id);

-- ============================================================================
-- 5. Create affiliate_payouts table for tracking commission payments
-- ============================================================================
CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id SERIAL PRIMARY KEY,
  refgrow_affiliate_id VARCHAR(255) NOT NULL, -- RefGrow's affiliate ID
  users_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Local user ID (if applicable)
  payout_amount DECIMAL(10,2) NOT NULL, -- Total payout amount
  payout_method VARCHAR(50), -- paypal, wise, bank_transfer, etc.
  payout_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  payout_date TIMESTAMP, -- When payout was processed
  transaction_id VARCHAR(255), -- PayPal/Wise transaction ID
  referral_count INTEGER DEFAULT 0, -- Number of referrals in this payout
  period_start DATE, -- Payout period start
  period_end DATE, -- Payout period end
  metadata JSONB, -- Additional payout data
  notes TEXT, -- Admin notes
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_refgrow_affiliate_id ON affiliate_payouts(refgrow_affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_users_id ON affiliate_payouts(users_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status ON affiliate_payouts(payout_status);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_date ON affiliate_payouts(payout_date);

-- ============================================================================
-- 6. Create affiliate_clicks table for tracking click-through data
-- ============================================================================
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id SERIAL PRIMARY KEY,
  referral_code VARCHAR(100) NOT NULL,
  refgrow_affiliate_id VARCHAR(255),
  ip_address VARCHAR(45), -- Support IPv6
  user_agent TEXT,
  referrer_url TEXT, -- Where they came from
  landing_page TEXT, -- Where they landed
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_term VARCHAR(255),
  utm_content VARCHAR(255),
  country VARCHAR(2), -- ISO country code
  device_type VARCHAR(50), -- desktop, mobile, tablet
  converted BOOLEAN DEFAULT FALSE, -- Did they convert?
  users_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Set when user signs up
  clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_referral_code ON affiliate_clicks(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_refgrow_affiliate_id ON affiliate_clicks(refgrow_affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_users_id ON affiliate_clicks(users_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_converted ON affiliate_clicks(converted);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_clicked_at ON affiliate_clicks(clicked_at);

-- ============================================================================
-- 7. Create updated_at trigger for automatic timestamp updates
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to affiliate_referrals
DROP TRIGGER IF EXISTS update_affiliate_referrals_updated_at ON affiliate_referrals;
CREATE TRIGGER update_affiliate_referrals_updated_at
  BEFORE UPDATE ON affiliate_referrals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to affiliate_payouts
DROP TRIGGER IF EXISTS update_affiliate_payouts_updated_at ON affiliate_payouts;
CREATE TRIGGER update_affiliate_payouts_updated_at
  BEFORE UPDATE ON affiliate_payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. Add comments for documentation
-- ============================================================================
COMMENT ON TABLE affiliate_referrals IS 'Tracks all affiliate referrals and their conversion status';
COMMENT ON TABLE affiliate_payouts IS 'Tracks commission payments to affiliates';
COMMENT ON TABLE affiliate_clicks IS 'Tracks all affiliate link clicks for analytics';

COMMENT ON COLUMN users.refgrow_affiliate_id IS 'RefGrow affiliate ID if user is an affiliate';
COMMENT ON COLUMN users.referred_by_code IS 'Referral code used when user signed up';
COMMENT ON COLUMN users.is_affiliate IS 'Whether user is enrolled in affiliate program';

-- ============================================================================
-- Migration complete
-- ============================================================================
