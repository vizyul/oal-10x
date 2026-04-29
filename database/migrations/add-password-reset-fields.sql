-- Add password reset fields to users table
-- Adds a token + expiry timestamp used by the /auth/forgot-password and
-- /auth/reset-password/:token flow. The partial index keeps lookups fast
-- without bloating the index for the common case (token is NULL).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_password_reset_token
  ON users (password_reset_token)
  WHERE password_reset_token IS NOT NULL;
