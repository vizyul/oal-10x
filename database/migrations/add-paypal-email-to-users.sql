-- Add PayPal payout email fields to users table
-- Used by the /affiliate/settings flow so an affiliate can register a verified
-- PayPal email for payouts. The email is verified via a 6-digit code sent to
-- the entered address (proves inbox ownership), then pushed to RefGrow via
-- PUT /api/v1/affiliates/:email.
--
-- Separate columns from the existing email_verification_token so that a user's
-- account-email verification cannot collide with their PayPal-email verification.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS paypal_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS paypal_email_verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS paypal_email_pending VARCHAR(255),
  ADD COLUMN IF NOT EXISTS paypal_verification_token VARCHAR(10),
  ADD COLUMN IF NOT EXISTS paypal_verification_expires TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS paypal_verification_sent_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_paypal_verification_token
  ON users (paypal_verification_token)
  WHERE paypal_verification_token IS NOT NULL;
