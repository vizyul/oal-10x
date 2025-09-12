# 🚀 CONTENT STORAGE MIGRATION PLAN

## 📋 Migration Overview

**Objective**: Migrate from fixed-column content storage to normalized schema
**Approach**: Zero-downtime migration with data preservation
**Timeline**: 4 phases with rollback capabilities at each stage

---

## 🎯 PHASE 1: CREATE NEW SCHEMA (Zero Downtime)

### Step 1.1: Create content_types Table
```sql
CREATE TABLE content_types (
  id SERIAL PRIMARY KEY,
  key VARCHAR(50) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  icon VARCHAR(10),
  description TEXT,
  display_order INTEGER DEFAULT 0,
  requires_ai BOOLEAN DEFAULT true,
  has_url_field BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_content_types_key ON content_types(key);
CREATE INDEX idx_content_types_active ON content_types(is_active);
CREATE INDEX idx_content_types_display_order ON content_types(display_order);
```

### Step 1.2: Create video_content Table
```sql
CREATE TABLE video_content (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  content_type_id INTEGER NOT NULL REFERENCES content_types(id),
  content_text TEXT,
  content_url TEXT,
  
  -- Generation metadata
  ai_provider VARCHAR(50),
  prompt_used_id INTEGER REFERENCES ai_prompts(id),
  generation_status VARCHAR(20) DEFAULT 'completed',
  generation_started_at TIMESTAMP WITH TIME ZONE,
  generation_completed_at TIMESTAMP WITH TIME ZONE,
  generation_duration_seconds INTEGER,
  
  -- Quality metadata
  content_quality_score DECIMAL(3,2),
  user_rating INTEGER,
  is_published BOOLEAN DEFAULT true,
  
  -- Versioning
  version INTEGER DEFAULT 1,
  parent_content_id INTEGER REFERENCES video_content(id),
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id INTEGER REFERENCES users(id),
  
  UNIQUE(video_id, content_type_id, version),
  CHECK (content_text IS NOT NULL OR content_url IS NOT NULL)
);

CREATE INDEX idx_video_content_video_id ON video_content(video_id);
CREATE INDEX idx_video_content_content_type_id ON video_content(content_type_id);
CREATE INDEX idx_video_content_status ON video_content(generation_status);
CREATE INDEX idx_video_content_published ON video_content(is_published);
```

### Step 1.3: Populate content_types Table
```sql
INSERT INTO content_types (key, label, icon, description, display_order, requires_ai, has_url_field) VALUES
('transcript_text', 'Transcript', '📄', 'YouTube video transcript extraction', 1, false, true),
('summary_text', 'Summary', '📋', 'AI-generated content summary', 2, true, true),
('study_guide_text', 'Study Guide', '📚', 'Educational study materials', 3, true, true),
('discussion_guide_text', 'Discussion Guide', '💬', 'Questions for group discussions', 4, true, true),
('group_guide_text', 'Group Guide', '👥', 'Team and group activities', 5, true, true),
('social_media_text', 'Social Media', '📱', 'Content for social platforms', 6, true, true),
('quiz_text', 'Quiz', '❓', 'Comprehension questions', 7, true, true),
('chapters_text', 'Chapters', '📖', 'Video chapters and timestamps', 8, true, true),
('ebook_text', 'E-Book', '📘', 'Long-form comprehensive content', 9, true, true),
('podcast_text', 'Podcast', '🎙️', 'Audio-optimized content', 10, true, true),
('blog_text', 'Blog Post', '✍️', 'Blog article content', 11, true, true),
('quotes_text', 'Quotes', '💭', 'Key quotes and insights', 12, true, true);
```

---

## 🔄 PHASE 2: DATA MIGRATION (Read-Only Period)

### Step 2.1: Create Migration Script
**File**: `scripts/migrate-content-data.js`

### Step 2.2: Migrate Existing Content Data
- Extract all content from videos table columns
- Map to appropriate content_type_id
- Preserve creation timestamps where possible
- Handle content + URL pairs correctly

### Step 2.3: Validate Data Integrity
- Compare row counts
- Verify content text matches
- Check all videos have expected content types

---

## 🔄 PHASE 3: APPLICATION CODE UPDATES (Dual-Write Mode)

### Step 3.1: Create New Services
1. **ContentService**: Manages video_content CRUD operations
2. **ContentTypesService**: Manages content type definitions
3. **ContentGenerationService**: Handles AI content creation

### Step 3.2: Update Existing Services
1. **VideosController**: Use ContentService for content operations
2. **Content Generation**: Write to both old and new tables
3. **API Endpoints**: Add new endpoints while keeping old ones

### Step 3.3: Frontend Updates
1. **Dynamic Content Loading**: Use new API endpoints
2. **Content Management UI**: Version control and quality features
3. **Admin Interface**: Content type management

---

## ✅ PHASE 4: CUTOVER & CLEANUP (Final Switch)

### Step 4.1: Switch to New Schema
- Update all read operations to use new tables
- Stop dual-write mode
- Monitor for issues

### Step 4.2: Clean Up Old Schema
```sql
-- Remove old content columns from videos table
ALTER TABLE videos DROP COLUMN IF EXISTS transcript_text;
ALTER TABLE videos DROP COLUMN IF EXISTS transcript_url;
ALTER TABLE videos DROP COLUMN IF EXISTS blog_text;
ALTER TABLE videos DROP COLUMN IF EXISTS blog_url;
-- ... (continue for all content columns)
```

### Step 4.3: Update ai_prompts Table
```sql
-- Add reference to content_types
ALTER TABLE ai_prompts ADD COLUMN content_type_id INTEGER REFERENCES content_types(id);

-- Populate the new reference
UPDATE ai_prompts SET content_type_id = (
  SELECT id FROM content_types WHERE key = ai_prompts.content_type
);

-- Remove redundant columns
ALTER TABLE ai_prompts DROP COLUMN content_type;
ALTER TABLE ai_prompts DROP COLUMN content_icon;
ALTER TABLE ai_prompts DROP COLUMN content_label;
ALTER TABLE ai_prompts DROP COLUMN display_order;
```

---

## 🛡️ ROLLBACK STRATEGIES

### Phase 1 Rollback
- Simply DROP new tables (no data loss)

### Phase 2 Rollback  
- Clear video_content table
- Original data still in videos table

### Phase 3 Rollback
- Switch application back to old schema
- Stop dual-write mode

### Phase 4 Rollback (Emergency Only)
- Re-create old columns in videos table
- Migrate data back from video_content table

---

## 📊 TESTING STRATEGY

### Pre-Migration Testing
1. **Schema Validation**: Test table creation scripts
2. **Data Migration Testing**: Test on copy of production data
3. **Application Testing**: Verify new code works with new schema

### During Migration Testing
1. **Data Integrity Checks**: Automated validation scripts
2. **Performance Testing**: Query performance comparison
3. **Rollback Testing**: Verify rollback procedures work

### Post-Migration Testing
1. **Functional Testing**: All content features work
2. **Performance Monitoring**: New schema performs well
3. **User Acceptance Testing**: UI works as expected

---

## 📈 SUCCESS METRICS

### Technical Metrics
- **Schema Simplicity**: Videos table column count reduction (49 → ~25 columns)
- **Query Performance**: Content retrieval speed improvement
- **Storage Efficiency**: Reduced NULL value storage

### Business Metrics
- **Content Type Addition Speed**: New content types added in minutes, not hours
- **Development Velocity**: Faster feature development
- **Scalability**: Support for unlimited content types

### Quality Metrics
- **Data Integrity**: 100% content preservation during migration
- **Zero Downtime**: No service interruption
- **Feature Completeness**: All existing features work post-migration

---

## 🔧 IMPLEMENTATION TIMELINE

| Phase | Duration | Downtime | Risk Level |
|-------|----------|----------|------------|
| Phase 1: New Schema | 1-2 hours | None | Low |
| Phase 2: Data Migration | 2-4 hours | None | Medium |
| Phase 3: Code Updates | 1-2 days | None | Medium |
| Phase 4: Cutover | 1-2 hours | Minimal | High |

**Total Timeline**: 2-3 days
**Total Downtime**: < 30 minutes (during cutover only)

---

## 🚨 CRITICAL SUCCESS FACTORS

1. **Thorough Testing**: Test migration on production data copy
2. **Monitoring**: Real-time monitoring during migration
3. **Rollback Readiness**: Tested rollback procedures at each phase
4. **Team Coordination**: Clear communication during cutover
5. **Performance Validation**: Verify new schema performs better

---

**NEXT STEP**: Implement Phase 1 - Create migration scripts for new schema creation.