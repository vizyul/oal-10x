#!/usr/bin/env node

/**
 * Clear YouTube OAuth Tokens Script
 * 
 * This script clears invalid YouTube OAuth tokens after updating
 * the OAuth client credentials. Users will need to re-authorize.
 */

const database = require('./src/services/database.service');

async function clearYouTubeTokens() {
  try {
    console.log('🧹 Starting YouTube OAuth token cleanup...');
    
    // Get count of existing tokens
    const countResult = await database.query(
      'SELECT COUNT(*) as count FROM youtube_oauth_tokens WHERE is_active = true'
    );
    
    const tokenCount = parseInt(countResult.rows[0].count);
    console.log(`📊 Found ${tokenCount} active YouTube OAuth tokens`);
    
    if (tokenCount === 0) {
      console.log('✅ No active tokens found - nothing to clear');
      return;
    }
    
    // Show affected users (optional - remove if you want to skip this step)
    console.log('\n👥 Users affected:');
    const usersResult = await database.query(`
      SELECT DISTINCT u.email, u.first_name, u.last_name, yot.channel_name 
      FROM youtube_oauth_tokens yot
      JOIN users u ON yot.user_id = u.id 
      WHERE yot.is_active = true
      ORDER BY u.email
    `);
    
    usersResult.rows.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email} (${user.first_name} ${user.last_name}) - Channel: ${user.channel_name || 'N/A'}`);
    });
    
    // Confirm before proceeding
    console.log(`\n⚠️  This will deactivate ${tokenCount} YouTube OAuth tokens.`);
    console.log('   Users will need to re-authorize their YouTube connections.');
    console.log('   This is necessary after updating OAuth client credentials.');
    
    // In a real scenario, you might want to prompt for confirmation
    // For now, we'll proceed automatically
    console.log('\n🔄 Proceeding with token cleanup...');
    
    // Deactivate all YouTube OAuth tokens (don't delete - keep for audit trail)
    const updateResult = await database.query(`
      UPDATE youtube_oauth_tokens 
      SET is_active = false, 
          updated_at = NOW()
      WHERE is_active = true
      RETURNING user_id, channel_name
    `);
    
    console.log(`✅ Successfully deactivated ${updateResult.rows.length} YouTube OAuth tokens`);
    
    // Also clear any YouTube channel records for a fresh start
    const channelsResult = await database.query(`
      UPDATE user_youtube_channels 
      SET is_primary = false, 
          last_synced = NOW()
      WHERE is_primary = true
    `);
    
    console.log(`📺 Updated ${channelsResult.rows.length} YouTube channel records`);
    
    console.log('\n🎉 Cleanup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Affected users should visit their YouTube connection page');
    console.log('   2. They will see a "Connect YouTube" option');
    console.log('   3. After re-authorization, they can access their YouTube videos again');
    console.log('   4. The "unauthorized_client" error should be resolved');
    
  } catch (error) {
    console.error('❌ Error during token cleanup:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the cleanup
async function main() {
  try {
    await clearYouTubeTokens();
    console.log('\n✨ Token cleanup script completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { clearYouTubeTokens };