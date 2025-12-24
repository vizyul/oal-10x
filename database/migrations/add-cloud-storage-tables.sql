-- =====================================================================
-- CLOUD STORAGE INTEGRATION DATABASE SCHEMA
-- =====================================================================
-- This migration creates database tables to manage cloud storage
-- OAuth credentials for Google Drive, OneDrive, and Dropbox integration.
--
-- Design Goals:
-- 1. Securely store OAuth tokens with AES-256-CBC encryption
-- 2. Support multiple cloud storage providers per user
-- 3. Track folder preferences and auto-upload settings
-- 4. Enable automatic content uploads after generation
-- =====================================================================

-- =====================================================================
-- Table: cloud_storage_credentials
-- Purpose: Store encrypted OAuth tokens for cloud storage providers
-- =====================================================================
CREATE TABLE IF NOT EXISTS cloud_storage_credentials (
    id SERIAL PRIMARY KEY,

    -- User Relationship
    users_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Provider Information
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('google_drive', 'onedrive', 'dropbox')),

    -- Encrypted Token Storage (AES-256-CBC)
    encrypted_tokens TEXT NOT NULL,
    encryption_iv VARCHAR(64) NOT NULL,
    encryption_algorithm VARCHAR(20) NOT NULL DEFAULT 'aes-256-cbc',

    -- Token Metadata
    token_expires_at TIMESTAMP WITH TIME ZONE,
    last_refreshed TIMESTAMP WITH TIME ZONE,

    -- Account Information
    account_email VARCHAR(255),
    account_name VARCHAR(255),
    account_id VARCHAR(255),

    -- Folder Configuration
    root_folder_id VARCHAR(500),
    root_folder_path VARCHAR(1000),
    folder_naming_pattern VARCHAR(255) DEFAULT '{content_type}_{video_code}',

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT unique_user_provider UNIQUE (users_id, provider)
);

-- Indexes for cloud_storage_credentials
CREATE INDEX idx_cloud_storage_user ON cloud_storage_credentials(users_id);
CREATE INDEX idx_cloud_storage_provider ON cloud_storage_credentials(provider);
CREATE INDEX idx_cloud_storage_active ON cloud_storage_credentials(is_active) WHERE is_active = true;
CREATE INDEX idx_cloud_storage_user_active ON cloud_storage_credentials(users_id, is_active) WHERE is_active = true;

-- =====================================================================
-- Table: cloud_storage_uploads
-- Purpose: Track file uploads to cloud storage for audit and retry
-- =====================================================================
CREATE TABLE IF NOT EXISTS cloud_storage_uploads (
    id SERIAL PRIMARY KEY,

    -- Relationships
    users_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cloud_storage_credentials_id INTEGER NOT NULL REFERENCES cloud_storage_credentials(id) ON DELETE CASCADE,
    videos_id INTEGER REFERENCES videos(id) ON DELETE SET NULL,
    video_content_id INTEGER REFERENCES video_content(id) ON DELETE SET NULL,

    -- Upload Details
    provider VARCHAR(50) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_format VARCHAR(20) NOT NULL CHECK (file_format IN ('docx', 'pdf', 'txt', 'md')),
    file_name VARCHAR(500) NOT NULL,
    file_size INTEGER,

    -- Cloud Storage References
    cloud_file_id VARCHAR(500),
    cloud_file_url VARCHAR(2000),
    cloud_folder_id VARCHAR(500),
    cloud_folder_path VARCHAR(1000),

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'completed', 'failed', 'cancelled')),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for cloud_storage_uploads
CREATE INDEX idx_cloud_uploads_user ON cloud_storage_uploads(users_id);
CREATE INDEX idx_cloud_uploads_video ON cloud_storage_uploads(videos_id);
CREATE INDEX idx_cloud_uploads_status ON cloud_storage_uploads(status);
CREATE INDEX idx_cloud_uploads_provider ON cloud_storage_uploads(provider);
CREATE INDEX idx_cloud_uploads_pending ON cloud_storage_uploads(status, retry_count) WHERE status = 'pending' OR status = 'failed';

-- =====================================================================
-- Alter user_preferences: Add cloud storage preferences
-- =====================================================================
DO $$
BEGIN
    -- Add cloud_storage_provider column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'user_preferences'
                   AND column_name = 'cloud_storage_provider') THEN
        ALTER TABLE user_preferences
        ADD COLUMN cloud_storage_provider VARCHAR(50) DEFAULT NULL;
    END IF;

    -- Add cloud_storage_auto_upload column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'user_preferences'
                   AND column_name = 'cloud_storage_auto_upload') THEN
        ALTER TABLE user_preferences
        ADD COLUMN cloud_storage_auto_upload BOOLEAN DEFAULT false;
    END IF;

    -- Add cloud_storage_upload_format column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'user_preferences'
                   AND column_name = 'cloud_storage_upload_format') THEN
        ALTER TABLE user_preferences
        ADD COLUMN cloud_storage_upload_format VARCHAR(20) DEFAULT 'both';
    END IF;

    -- Add cloud_storage_folder_per_video column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'user_preferences'
                   AND column_name = 'cloud_storage_folder_per_video') THEN
        ALTER TABLE user_preferences
        ADD COLUMN cloud_storage_folder_per_video BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Add constraint for cloud_storage_upload_format
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage
                   WHERE table_name = 'user_preferences'
                   AND constraint_name = 'check_cloud_upload_format') THEN
        ALTER TABLE user_preferences
        ADD CONSTRAINT check_cloud_upload_format
        CHECK (cloud_storage_upload_format IN ('docx', 'pdf', 'both', 'none'));
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================================
-- Alter users: Add preferred cloud storage provider
-- =====================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users'
                   AND column_name = 'preferred_cloud_storage') THEN
        ALTER TABLE users
        ADD COLUMN preferred_cloud_storage VARCHAR(50) DEFAULT NULL;
    END IF;
END $$;

-- =====================================================================
-- TRIGGERS: Auto-update timestamps
-- =====================================================================

-- Trigger function for cloud_storage_credentials
CREATE OR REPLACE FUNCTION update_cloud_storage_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_cloud_storage_credentials_updated_at ON cloud_storage_credentials;
CREATE TRIGGER trigger_cloud_storage_credentials_updated_at
    BEFORE UPDATE ON cloud_storage_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_cloud_storage_credentials_updated_at();

-- Trigger for cloud_storage_uploads
DROP TRIGGER IF EXISTS trigger_cloud_storage_uploads_updated_at ON cloud_storage_uploads;
CREATE TRIGGER trigger_cloud_storage_uploads_updated_at
    BEFORE UPDATE ON cloud_storage_uploads
    FOR EACH ROW
    EXECUTE FUNCTION update_cloud_storage_credentials_updated_at();

-- =====================================================================
-- HELPER FUNCTIONS
-- =====================================================================

-- Function to get user's active cloud storage credentials
CREATE OR REPLACE FUNCTION get_user_cloud_storage(user_id_param INTEGER)
RETURNS TABLE (
    id INTEGER,
    provider VARCHAR,
    account_email VARCHAR,
    account_name VARCHAR,
    root_folder_path VARCHAR,
    is_active BOOLEAN,
    last_used TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        csc.id,
        csc.provider,
        csc.account_email,
        csc.account_name,
        csc.root_folder_path,
        csc.is_active,
        csc.last_used
    FROM cloud_storage_credentials csc
    WHERE csc.users_id = user_id_param
      AND csc.is_active = true
    ORDER BY csc.last_used DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Function to get upload statistics for a user
CREATE OR REPLACE FUNCTION get_cloud_upload_stats(user_id_param INTEGER)
RETURNS TABLE (
    provider VARCHAR,
    total_uploads BIGINT,
    successful_uploads BIGINT,
    failed_uploads BIGINT,
    pending_uploads BIGINT,
    total_size BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        csu.provider,
        COUNT(*) as total_uploads,
        COUNT(*) FILTER (WHERE csu.status = 'completed') as successful_uploads,
        COUNT(*) FILTER (WHERE csu.status = 'failed') as failed_uploads,
        COUNT(*) FILTER (WHERE csu.status = 'pending' OR csu.status = 'uploading') as pending_uploads,
        COALESCE(SUM(csu.file_size) FILTER (WHERE csu.status = 'completed'), 0) as total_size
    FROM cloud_storage_uploads csu
    WHERE csu.users_id = user_id_param
    GROUP BY csu.provider;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================================

COMMENT ON TABLE cloud_storage_credentials IS 'OAuth credentials for cloud storage providers (Google Drive, OneDrive, Dropbox)';
COMMENT ON TABLE cloud_storage_uploads IS 'Audit log of file uploads to cloud storage';

COMMENT ON COLUMN cloud_storage_credentials.encrypted_tokens IS 'AES-256-CBC encrypted OAuth tokens (access_token, refresh_token)';
COMMENT ON COLUMN cloud_storage_credentials.encryption_iv IS 'Initialization vector for token decryption (hex encoded)';
COMMENT ON COLUMN cloud_storage_credentials.root_folder_id IS 'Provider-specific folder ID where AmplifyContent folder is created';
COMMENT ON COLUMN cloud_storage_credentials.folder_naming_pattern IS 'Pattern for naming upload folders. Variables: {content_type}, {video_code}, {video_title}';

COMMENT ON COLUMN user_preferences.cloud_storage_auto_upload IS 'When true, automatically upload generated content to cloud storage';
COMMENT ON COLUMN user_preferences.cloud_storage_upload_format IS 'File format for auto-uploads: docx, pdf, both, or none';

-- =====================================================================
-- END OF MIGRATION
-- =====================================================================
