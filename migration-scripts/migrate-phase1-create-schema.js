const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migratePhase1CreateSchema() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 PHASE 1: CREATING NORMALIZED CONTENT SCHEMA');
    console.log('=' + '='.repeat(60) + '\n');
    
    // Start transaction for atomic operation
    await client.query('BEGIN');
    
    // 1. Create content_types table
    console.log('📋 Step 1: Creating content_types table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_types (
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
      )
    `);
    
    // Create indexes for content_types
    await client.query('CREATE INDEX IF NOT EXISTS idx_content_types_key ON content_types(key)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_content_types_active ON content_types(is_active)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_content_types_display_order ON content_types(display_order)');
    
    console.log('✅ content_types table created with indexes');
    
    // 2. Create video_content table
    console.log('📋 Step 2: Creating video_content table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS video_content (
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
        user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
        is_published BOOLEAN DEFAULT true,
        
        -- Versioning
        version INTEGER DEFAULT 1,
        parent_content_id INTEGER REFERENCES video_content(id),
        
        -- Tracking
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_by_user_id INTEGER REFERENCES users(id),
        
        -- Constraints
        UNIQUE(video_id, content_type_id, version),
        CHECK (content_text IS NOT NULL OR content_url IS NOT NULL)
      )
    `);
    
    // Create indexes for video_content
    await client.query('CREATE INDEX IF NOT EXISTS idx_video_content_video_id ON video_content(video_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_video_content_content_type_id ON video_content(content_type_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_video_content_status ON video_content(generation_status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_video_content_published ON video_content(is_published)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_video_content_version ON video_content(video_id, content_type_id, version)');
    
    console.log('✅ video_content table created with indexes');
    
    // 3. Populate content_types table
    console.log('📋 Step 3: Populating content_types table...');
    
    const contentTypes = [
      { key: 'transcript_text', label: 'Transcript', icon: '📄', description: 'YouTube video transcript extraction', order: 1, requires_ai: false },
      { key: 'summary_text', label: 'Summary', icon: '📋', description: 'AI-generated content summary', order: 2, requires_ai: true },
      { key: 'study_guide_text', label: 'Study Guide', icon: '📚', description: 'Educational study materials', order: 3, requires_ai: true },
      { key: 'discussion_guide_text', label: 'Discussion Guide', icon: '💬', description: 'Questions for group discussions', order: 4, requires_ai: true },
      { key: 'group_guide_text', label: 'Group Guide', icon: '👥', description: 'Team and group activities', order: 5, requires_ai: true },
      { key: 'social_media_text', label: 'Social Media', icon: '📱', description: 'Content for social platforms', order: 6, requires_ai: true },
      { key: 'quiz_text', label: 'Quiz', icon: '❓', description: 'Comprehension questions', order: 7, requires_ai: true },
      { key: 'chapters_text', label: 'Chapters', icon: '📖', description: 'Video chapters and timestamps', order: 8, requires_ai: true },
      { key: 'ebook_text', label: 'E-Book', icon: '📘', description: 'Long-form comprehensive content', order: 9, requires_ai: true },
      { key: 'podcast_text', label: 'Podcast', icon: '🎙️', description: 'Audio-optimized content', order: 10, requires_ai: true },
      { key: 'blog_text', label: 'Blog Post', icon: '✍️', description: 'Blog article content', order: 11, requires_ai: true },
      { key: 'quotes_text', label: 'Quotes', icon: '💭', description: 'Key quotes and insights', order: 12, requires_ai: true }
    ];
    
    for (const ct of contentTypes) {
      await client.query(`
        INSERT INTO content_types (key, label, icon, description, display_order, requires_ai, has_url_field, is_active) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (key) DO UPDATE SET
          label = EXCLUDED.label,
          icon = EXCLUDED.icon,
          description = EXCLUDED.description,
          display_order = EXCLUDED.display_order,
          requires_ai = EXCLUDED.requires_ai,
          updated_at = CURRENT_TIMESTAMP
      `, [ct.key, ct.label, ct.icon, ct.description, ct.order, ct.requires_ai, true, true]);
      
      console.log(`  ✅ ${ct.icon} ${ct.label} (${ct.key})`);
    }
    
    // 4. Verify schema creation
    console.log('📋 Step 4: Verifying schema creation...');
    
    const contentTypesCount = await client.query('SELECT COUNT(*) FROM content_types');
    const videoContentTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'video_content'
      )
    `);
    
    console.log(`  ✅ Content types created: ${contentTypesCount.rows[0].count}`);
    console.log(`  ✅ Video content table exists: ${videoContentTableExists.rows[0].exists}`);
    
    // 5. Show current content types
    const contentTypesList = await client.query(`
      SELECT display_order, icon, label, key, requires_ai 
      FROM content_types 
      ORDER BY display_order
    `);
    
    console.log('\n📋 CONTENT TYPES READY:');
    contentTypesList.rows.forEach(ct => {
      const aiFlag = ct.requires_ai ? '🤖' : '🔧';
      console.log(`  ${ct.display_order}. ${ct.icon} ${ct.label} (${ct.key}) ${aiFlag}`);
    });
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('\n' + '=' + '='.repeat(60));
    console.log('🎉 PHASE 1 COMPLETE: New schema created successfully!');
    console.log('✅ Next step: Run Phase 2 data migration');
    console.log('=' + '='.repeat(60));
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating schema:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migratePhase1CreateSchema()
  .then(() => {
    console.log('\n✅ Phase 1 migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Phase 1 migration failed:', error.message);
    process.exit(1);
  });