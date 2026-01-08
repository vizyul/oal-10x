-- Migration: Add Thumbnail Generation Tables
-- ViralTube Architect Integration
-- Created: 2026-01-07

BEGIN;

-- 1. Thumbnail Styles Lookup Table
CREATE TABLE IF NOT EXISTS thumbnail_styles (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Expression Categories Lookup Table
CREATE TABLE IF NOT EXISTS thumbnail_expressions (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    primary_emotion VARCHAR(100) NOT NULL,
    face_details TEXT NOT NULL,
    eye_details TEXT NOT NULL,
    intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 3),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Content Categories Lookup Table
CREATE TABLE IF NOT EXISTS thumbnail_content_categories (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Reference Images Table
CREATE TABLE IF NOT EXISTS thumbnail_reference_images (
    id SERIAL PRIMARY KEY,
    users_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cloudinary_public_id VARCHAR(255) NOT NULL,
    cloudinary_url VARCHAR(500) NOT NULL,
    cloudinary_secure_url VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255),
    file_size_bytes INTEGER,
    width INTEGER,
    height INTEGER,
    mime_type VARCHAR(50),
    display_name VARCHAR(100),
    is_default BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reference_images_user ON thumbnail_reference_images(users_id);
CREATE INDEX IF NOT EXISTS idx_reference_images_default ON thumbnail_reference_images(users_id, is_default) WHERE is_default = TRUE;

-- 5. Video Thumbnails Table
CREATE TABLE IF NOT EXISTS video_thumbnails (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    users_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cloudinary_public_id VARCHAR(255) NOT NULL,
    cloudinary_url VARCHAR(500) NOT NULL,
    cloudinary_secure_url VARCHAR(500) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    sub_topic VARCHAR(255),
    expression_category VARCHAR(50) NOT NULL,
    aspect_ratio VARCHAR(10) NOT NULL DEFAULT '16:9',
    style_name VARCHAR(50) NOT NULL,
    content_category VARCHAR(50),
    file_size_bytes INTEGER,
    width INTEGER,
    height INTEGER,
    format VARCHAR(10) DEFAULT 'png',
    is_selected BOOLEAN DEFAULT FALSE,
    is_uploaded_to_youtube BOOLEAN DEFAULT FALSE,
    generation_order INTEGER NOT NULL,
    version INTEGER DEFAULT 1,
    refinement_instruction TEXT,
    parent_thumbnail_id INTEGER REFERENCES video_thumbnails(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_video_thumbnails_video_id ON video_thumbnails(video_id);
CREATE INDEX IF NOT EXISTS idx_video_thumbnails_users_id ON video_thumbnails(users_id);
CREATE INDEX IF NOT EXISTS idx_video_thumbnails_selected ON video_thumbnails(video_id, is_selected) WHERE is_selected = TRUE;
CREATE INDEX IF NOT EXISTS idx_video_thumbnails_created ON video_thumbnails(video_id, created_at DESC);

-- 6. Thumbnail Generation Jobs Table
CREATE TABLE IF NOT EXISTS thumbnail_generation_jobs (
    id SERIAL PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    users_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic VARCHAR(255) NOT NULL,
    sub_topic VARCHAR(255),
    expression_category VARCHAR(50) NOT NULL,
    aspect_ratio VARCHAR(10) NOT NULL,
    content_category VARCHAR(50),
    reference_image_ids JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    current_style VARCHAR(50),
    generated_thumbnail_ids JSONB DEFAULT '[]',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_thumbnail_jobs_video ON thumbnail_generation_jobs(video_id);
CREATE INDEX IF NOT EXISTS idx_thumbnail_jobs_user ON thumbnail_generation_jobs(users_id);
CREATE INDEX IF NOT EXISTS idx_thumbnail_jobs_status ON thumbnail_generation_jobs(status) WHERE status IN ('pending', 'processing');

-- 7. Seed Lookup Data

-- Styles
INSERT INTO thumbnail_styles (key, name, description, display_order) VALUES
('cinematic_drama', 'Cinematic Drama', 'High contrast, deep shadows, moody movie-poster aesthetics, dramatic rim lighting, lens flares.', 1),
('hyper_vibrant', 'Hyper-Vibrant Pop', 'Maximum saturation, neon accents, energetic particles, bright and eye-catching YouTube-style colors.', 2),
('clean_studio', 'Clean & Studio', 'Solid bold background, minimal clutter, sharp edges, studio-lit professional aesthetics, 3D typography.', 3),
('gritty_mystery', 'Gritty & Mystery', 'Raw textures, desaturated environment, single intense glowing focal point, heavy atmosphere, smoke/fog.', 4)
ON CONFLICT (key) DO NOTHING;

-- Expressions
INSERT INTO thumbnail_expressions (key, name, primary_emotion, face_details, eye_details, intensity, display_order) VALUES
('shock', 'Shocking/Expose', 'Wide-eyed disbelief', 'Raised eyebrows, open mouth, tense forehead', 'Widened, staring directly at viewer', 3, 1),
('excitement', 'Exciting/Hype', 'Ecstatic joy', 'Huge smile, raised cheeks, visible teeth', 'Bright, energetic, possibly looking up', 2, 2),
('fear', 'Scary/Horror', 'Genuine fear', 'Pale complexion, furrowed brow, grimace', 'Wide, pupils dilated, looking off-frame', 3, 3),
('concern', 'Controversial/Drama', 'Intense concern', 'Frown, pursed lips, one raised eyebrow', 'Narrowed, skeptical, side-eye optional', 2, 4),
('amazement', 'Educational/Mind-blown', 'Amazed realization', '"Aha" expression, slight smile, raised brows', 'Wide but focused, enlightened look', 2, 5),
('sorrow', 'Sad/Emotional', 'Empathetic sorrow', 'Downturned mouth, soft eyes, slight frown', 'Glistening, compassionate, looking down', 1, 6),
('anger', 'Angry/Rant', 'Controlled fury', 'Clenched jaw, flared nostrils, hard stare', 'Intense, locked on viewer, brows lowered', 3, 7),
('confusion', 'Confused/Mystery', 'Puzzled curiosity', 'Head tilt, squinted eyes, quirked mouth', 'Searching, uncertain, one eye more closed', 2, 8),
('triumph', 'Triumphant/Success', 'Proud confidence', 'Smirk or broad smile, chin up, relaxed face', 'Direct, assured, slight squint of satisfaction', 2, 9),
('urgency', 'Urgent/Breaking', 'Alert intensity', 'Serious expression, focused, slightly forward', 'Locked on viewer, conveying importance', 3, 10)
ON CONFLICT (key) DO NOTHING;

-- Content Categories
INSERT INTO thumbnail_content_categories (key, name, display_order) VALUES
('entertainment', 'Entertainment/Reaction', 1),
('educational', 'Educational/Tutorial', 2),
('news', 'News/Commentary', 3),
('lifestyle', 'Lifestyle/Vlog', 4),
('drama', 'Drama/Controversy', 5),
('review', 'Review/Comparison', 6)
ON CONFLICT (key) DO NOTHING;

COMMIT;
