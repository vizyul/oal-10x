-- Migration: Add User Character Profiles Table
-- Purpose: Store character anchor descriptions for consistent AI thumbnail generation
-- Created: 2026-01-07

BEGIN;

-- User Character Profiles Table
-- Stores physical descriptions for AI-consistent thumbnail generation
CREATE TABLE IF NOT EXISTS user_character_profiles (
    id SERIAL PRIMARY KEY,
    users_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_name VARCHAR(100) NOT NULL DEFAULT 'Default',

    -- Physical attributes (individual fields for UI flexibility)
    race_ethnicity VARCHAR(100),
    age_range VARCHAR(50),
    gender VARCHAR(50),
    face_shape VARCHAR(100),
    eye_description TEXT,
    hair_description TEXT,
    skin_tone VARCHAR(100),
    facial_hair TEXT,
    glasses_description TEXT,
    distinguishing_features TEXT,

    -- Full anchor text (can be auto-generated from above fields or custom written)
    full_anchor_text TEXT,

    -- Settings
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_character_profiles_user ON user_character_profiles(users_id);
CREATE INDEX IF NOT EXISTS idx_character_profiles_default ON user_character_profiles(users_id, is_default) WHERE is_default = TRUE;

-- Function to generate full anchor text from individual fields
CREATE OR REPLACE FUNCTION generate_character_anchor_text(
    p_race_ethnicity VARCHAR,
    p_age_range VARCHAR,
    p_gender VARCHAR,
    p_face_shape VARCHAR,
    p_eye_description TEXT,
    p_hair_description TEXT,
    p_skin_tone VARCHAR,
    p_facial_hair TEXT,
    p_glasses_description TEXT,
    p_distinguishing_features TEXT
) RETURNS TEXT AS $$
DECLARE
    anchor_text TEXT := '';
BEGIN
    -- Build the anchor text from non-null fields
    IF p_race_ethnicity IS NOT NULL AND p_race_ethnicity != '' THEN
        anchor_text := anchor_text || '- Race/Ethnicity: ' || p_race_ethnicity || E'\n';
    END IF;

    IF p_gender IS NOT NULL AND p_gender != '' THEN
        anchor_text := anchor_text || '- Gender: ' || p_gender || E'\n';
    END IF;

    IF p_age_range IS NOT NULL AND p_age_range != '' THEN
        anchor_text := anchor_text || '- Age: ' || p_age_range || E'\n';
    END IF;

    IF p_face_shape IS NOT NULL AND p_face_shape != '' THEN
        anchor_text := anchor_text || '- Face shape: ' || p_face_shape || E'\n';
    END IF;

    IF p_eye_description IS NOT NULL AND p_eye_description != '' THEN
        anchor_text := anchor_text || '- Eyes: ' || p_eye_description || E'\n';
    END IF;

    IF p_hair_description IS NOT NULL AND p_hair_description != '' THEN
        anchor_text := anchor_text || '- Hair: ' || p_hair_description || E'\n';
    END IF;

    IF p_skin_tone IS NOT NULL AND p_skin_tone != '' THEN
        anchor_text := anchor_text || '- Skin tone: ' || p_skin_tone || E'\n';
    END IF;

    IF p_facial_hair IS NOT NULL AND p_facial_hair != '' THEN
        anchor_text := anchor_text || '- Facial hair: ' || p_facial_hair || E'\n';
    END IF;

    IF p_glasses_description IS NOT NULL AND p_glasses_description != '' THEN
        anchor_text := anchor_text || '- Glasses: ' || p_glasses_description || E'\n';
    END IF;

    IF p_distinguishing_features IS NOT NULL AND p_distinguishing_features != '' THEN
        anchor_text := anchor_text || '- Distinguishing features: ' || p_distinguishing_features || E'\n';
    END IF;

    RETURN TRIM(anchor_text);
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate full_anchor_text if not provided
CREATE OR REPLACE FUNCTION update_character_anchor_text()
RETURNS TRIGGER AS $$
BEGIN
    -- Only auto-generate if full_anchor_text is null or empty
    IF NEW.full_anchor_text IS NULL OR NEW.full_anchor_text = '' THEN
        NEW.full_anchor_text := generate_character_anchor_text(
            NEW.race_ethnicity,
            NEW.age_range,
            NEW.gender,
            NEW.face_shape,
            NEW.eye_description,
            NEW.hair_description,
            NEW.skin_tone,
            NEW.facial_hair,
            NEW.glasses_description,
            NEW.distinguishing_features
        );
    END IF;

    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_character_anchor
    BEFORE INSERT OR UPDATE ON user_character_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_character_anchor_text();

-- Trigger to ensure only one default profile per user
CREATE OR REPLACE FUNCTION ensure_single_default_profile()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = TRUE THEN
        UPDATE user_character_profiles
        SET is_default = FALSE
        WHERE users_id = NEW.users_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_single_default_profile
    AFTER INSERT OR UPDATE OF is_default ON user_character_profiles
    FOR EACH ROW
    WHEN (NEW.is_default = TRUE)
    EXECUTE FUNCTION ensure_single_default_profile();

-- Sample character profile options for dropdowns (optional lookup tables)
CREATE TABLE IF NOT EXISTS character_profile_options (
    id SERIAL PRIMARY KEY,
    field_name VARCHAR(50) NOT NULL,
    option_value VARCHAR(100) NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- Seed common options
INSERT INTO character_profile_options (field_name, option_value, display_order) VALUES
-- Age ranges
('age_range', '18-25', 1),
('age_range', '26-35', 2),
('age_range', 'Late 30s to early 40s', 3),
('age_range', 'Late 40s to early 50s', 4),
('age_range', '50-60', 5),
('age_range', '60+', 6),
-- Face shapes
('face_shape', 'Oval', 1),
('face_shape', 'Round', 2),
('face_shape', 'Square', 3),
('face_shape', 'Heart', 4),
('face_shape', 'Oblong', 5),
('face_shape', 'Diamond', 6),
('face_shape', 'Oval with defined jawline', 7),
-- Skin tones
('skin_tone', 'Fair', 1),
('skin_tone', 'Light', 2),
('skin_tone', 'Medium', 3),
('skin_tone', 'Olive', 4),
('skin_tone', 'Tan', 5),
('skin_tone', 'Warm brown', 6),
('skin_tone', 'Dark brown', 7),
('skin_tone', 'Deep', 8),
-- Genders
('gender', 'Male', 1),
('gender', 'Female', 2),
('gender', 'Non-binary', 3)
ON CONFLICT DO NOTHING;

COMMIT;
