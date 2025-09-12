const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migratePhase2DataMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 PHASE 2: MIGRATING EXISTING CONTENT DATA');
    console.log('=' + '='.repeat(60) + '\n');
    
    // Start transaction for atomic operation
    await client.query('BEGIN');
    
    // 1. Get content type mappings
    console.log('📋 Step 1: Loading content type mappings...');
    const contentTypesResult = await client.query(`
      SELECT id, key, label FROM content_types ORDER BY display_order
    `);
    
    const contentTypeMap = {};
    contentTypesResult.rows.forEach(ct => {
      contentTypeMap[ct.key] = { id: ct.id, label: ct.label };
    });
    
    console.log(`✅ Loaded ${Object.keys(contentTypeMap).length} content type mappings`);
    
    // 2. Get all videos with content
    console.log('📋 Step 2: Scanning videos for existing content...');
    const videosQuery = `
      SELECT 
        id, video_title, created_at, users_id,
        transcript_text, transcript_url,
        summary_text, summary_url,
        study_guide_text, study_guide_url,
        discussion_guide_text, discussion_guide_url,
        group_guide_text, group_guide_url,
        social_media_text, social_media_url,
        quiz_text, quiz_url,
        chapter_text, chapter_url,
        ebook_text, ebook_url,
        podcast_text, podcast_url,
        blog_text, blog_url,
        quotes_text, quotes_url
      FROM videos 
      ORDER BY id
    `;
    
    const videosResult = await client.query(videosQuery);
    console.log(`✅ Found ${videosResult.rows.length} videos to process`);
    
    // 3. Define content field mappings (old column name -> content_type key)
    const fieldMappings = {
      'transcript_text': { contentKey: 'transcript_text', urlField: 'transcript_url' },
      'summary_text': { contentKey: 'summary_text', urlField: 'summary_url' },
      'study_guide_text': { contentKey: 'study_guide_text', urlField: 'study_guide_url' },
      'discussion_guide_text': { contentKey: 'discussion_guide_text', urlField: 'discussion_guide_url' },
      'group_guide_text': { contentKey: 'group_guide_text', urlField: 'group_guide_url' },
      'social_media_text': { contentKey: 'social_media_text', urlField: 'social_media_url' },
      'quiz_text': { contentKey: 'quiz_text', urlField: 'quiz_url' },
      'chapter_text': { contentKey: 'chapters_text', urlField: 'chapter_url' }, // Note: maps to chapters_text
      'ebook_text': { contentKey: 'ebook_text', urlField: 'ebook_url' },
      'podcast_text': { contentKey: 'podcast_text', urlField: 'podcast_url' },
      'blog_text': { contentKey: 'blog_text', urlField: 'blog_url' },
      'quotes_text': { contentKey: 'quotes_text', urlField: 'quotes_url' }
    };
    
    // 4. Migrate content for each video
    console.log('📋 Step 3: Migrating content data...');
    let totalContentMigrated = 0;
    const migrationStats = {};
    
    for (const video of videosResult.rows) {
      const videoContentCount = await migrateVideoContent(client, video, fieldMappings, contentTypeMap, migrationStats);
      totalContentMigrated += videoContentCount;
      
      if (videoContentCount > 0) {
        console.log(`  ✅ Video ${video.id}: "${video.video_title}" - ${videoContentCount} content items migrated`);
      }
    }
    
    // 5. Show migration statistics
    console.log('\n📊 MIGRATION STATISTICS:');
    console.log('-'.repeat(40));
    Object.entries(migrationStats).forEach(([contentType, count]) => {
      const typeInfo = contentTypeMap[contentType];
      console.log(`  ${typeInfo?.label || contentType}: ${count} items`);
    });
    console.log('-'.repeat(40));
    console.log(`  TOTAL: ${totalContentMigrated} content items migrated`);
    
    // 6. Validate migration integrity
    console.log('\n📋 Step 4: Validating migration integrity...');
    
    const validationResults = await client.query(`
      SELECT 
        ct.label,
        ct.key,
        COUNT(vc.id) as migrated_count
      FROM content_types ct
      LEFT JOIN video_content vc ON ct.id = vc.content_type_id
      GROUP BY ct.id, ct.label, ct.key, ct.display_order
      ORDER BY ct.display_order
    `);
    
    console.log('📊 Content distribution in new schema:');
    validationResults.rows.forEach(result => {
      console.log(`  - ${result.label}: ${result.migrated_count} items`);
    });
    
    // 7. Check for data integrity issues
    const integrityCheck = await client.query(`
      SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN content_text IS NULL AND content_url IS NULL THEN 1 END) as empty_items,
        COUNT(CASE WHEN content_text IS NOT NULL THEN 1 END) as has_text,
        COUNT(CASE WHEN content_url IS NOT NULL THEN 1 END) as has_url
      FROM video_content
    `);
    
    const integrity = integrityCheck.rows[0];
    console.log(`\n🔍 Data integrity check:`);
    console.log(`  - Total items: ${integrity.total_items}`);
    console.log(`  - Items with text: ${integrity.has_text}`);
    console.log(`  - Items with URL: ${integrity.has_url}`);
    console.log(`  - Empty items: ${integrity.empty_items} ${integrity.empty_items > 0 ? '⚠️' : '✅'}`);
    
    if (parseInt(integrity.empty_items) > 0) {
      console.warn(`⚠️  WARNING: ${integrity.empty_items} items have neither text nor URL`);
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('\n' + '=' + '='.repeat(60));
    console.log('🎉 PHASE 2 COMPLETE: Content data migrated successfully!');
    console.log(`✅ ${totalContentMigrated} content items preserved`);
    console.log('✅ Next step: Update application code (Phase 3)');
    console.log('=' + '='.repeat(60));
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error migrating data:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function migrateVideoContent(client, video, fieldMappings, contentTypeMap, migrationStats) {
  let contentCount = 0;
  
  for (const [oldFieldName, mapping] of Object.entries(fieldMappings)) {
    const contentText = video[oldFieldName];
    const contentUrl = video[mapping.urlField];
    
    // Only migrate if there's actual content
    if (contentText || contentUrl) {
      const contentTypeId = contentTypeMap[mapping.contentKey]?.id;
      
      if (!contentTypeId) {
        console.warn(`⚠️  No content type found for ${mapping.contentKey}`);
        continue;
      }
      
      // Determine AI provider based on content type
      let aiProvider = null;
      if (mapping.contentKey !== 'transcript_text') {
        // For AI-generated content, default to 'gemini' (most common in our system)
        aiProvider = 'gemini';
      }
      
      // Insert into video_content table
      await client.query(`
        INSERT INTO video_content (
          video_id, content_type_id, content_text, content_url,
          ai_provider, generation_status, is_published, version,
          created_at, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        video.id,
        contentTypeId,
        contentText,
        contentUrl,
        aiProvider,
        'completed', // Existing content is considered completed
        true, // Existing content is published
        1, // Version 1
        video.created_at || new Date(),
        video.users_id
      ]);
      
      // Update statistics
      migrationStats[mapping.contentKey] = (migrationStats[mapping.contentKey] || 0) + 1;
      contentCount++;
    }
  }
  
  return contentCount;
}

migratePhase2DataMigration()
  .then(() => {
    console.log('\n✅ Phase 2 migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Phase 2 migration failed:', error.message);
    process.exit(1);
  });