#!/usr/bin/env node

/**
 * Sync Subscription Usage from Airtable to PostgreSQL
 * 
 * This script copies subscription usage records from Airtable to PostgreSQL
 * to ensure both databases have the same usage data
 */

const airtable = require('./src/services/airtable.service');
const database = require('./src/services/database.service');

async function syncSubscriptionUsage() {
  try {
    console.log('🔄 Syncing subscription usage from Airtable to PostgreSQL...\n');
    
    const userEmail = 'social@vizyul.com';
    console.log(`👤 Syncing usage for: ${userEmail}\n`);
    
    // 1. Get user IDs from both databases
    console.log('🔍 FINDING USER IN BOTH DATABASES:');
    console.log('===================================');
    
    // Find user in Airtable
    const airtableUsers = await airtable.findByField('Users', 'email', userEmail);
    if (airtableUsers.length === 0) {
      throw new Error(`User ${userEmail} not found in Airtable Users table`);
    }
    const airtableUserId = airtableUsers[0].id;
    console.log(`📧 Airtable User ID: ${airtableUserId}`);
    
    // Find user in PostgreSQL
    const pgUsers = await database.findByField('users', 'email', userEmail);
    if (pgUsers.length === 0) {
      throw new Error(`User ${userEmail} not found in PostgreSQL users table`);
    }
    const pgUserId = pgUsers[0].id;
    console.log(`🐘 PostgreSQL User ID: ${pgUserId}\n`);
    
    // 2. Get subscription usage from Airtable
    console.log('📋 GETTING AIRTABLE SUBSCRIPTION USAGE:');
    console.log('=======================================');
    
    const airtableUsageRecords = await airtable.findByField('Subscription_Usage', 'user_id', userEmail);
    console.log(`📊 Found ${airtableUsageRecords.length} usage records in Airtable`);
    
    if (airtableUsageRecords.length === 0) {
      throw new Error('No subscription usage records found in Airtable');
    }
    
    // Show current Airtable records
    airtableUsageRecords.forEach((record, index) => {
      console.log(`   Record ${index + 1}:`);
      console.log(`     Period: ${record.fields.period_start} to ${record.fields.period_end}`);
      console.log(`     Videos Processed: ${record.fields.videos_processed || 0}`);
      console.log(`     API Calls: ${record.fields.api_calls_made || 0}`);
      console.log(`     Storage: ${record.fields.storage_used_mb || 0} MB`);
    });
    
    // 3. First, check the PostgreSQL table structure
    console.log('\n🔍 CHECKING POSTGRESQL TABLE STRUCTURE:');
    console.log('======================================');
    
    const tableStructure = await database.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'subscription_usage' 
      ORDER BY ordinal_position
    `);
    
    console.log(`📋 subscription_usage table columns:`);
    tableStructure.rows.forEach(column => {
      console.log(`   ${column.column_name}: ${column.data_type} (${column.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // 4. Check current PostgreSQL usage records (using correct column name)
    console.log('\n💾 CHECKING POSTGRESQL SUBSCRIPTION USAGE:');
    console.log('==========================================');
    
    const pgUsageQuery = await database.query(
      'SELECT * FROM subscription_usage WHERE users_id = $1 ORDER BY period_start DESC',
      [pgUserId]
    );
    
    console.log(`📊 Found ${pgUsageQuery.rows.length} usage records in PostgreSQL`);
    
    if (pgUsageQuery.rows.length > 0) {
      pgUsageQuery.rows.forEach((record, index) => {
        console.log(`   Record ${index + 1}:`);
        console.log(`     Period: ${record.period_start?.toISOString().split('T')[0]} to ${record.period_end?.toISOString().split('T')[0]}`);
        console.log(`     Videos Processed: ${record.videos_processed || 0}`);
        console.log(`     API Calls: ${record.api_calls_made || 0}`);
        console.log(`     Storage: ${record.storage_used_mb || 0} MB`);
      });
    }
    
    // 4. Sync records from Airtable to PostgreSQL
    console.log('\n🔄 SYNCING RECORDS TO POSTGRESQL:');
    console.log('==================================');
    
    for (const airtableRecord of airtableUsageRecords) {
      const periodStart = new Date(airtableRecord.fields.period_start);
      const periodEnd = new Date(airtableRecord.fields.period_end);
      
      console.log(`\n📋 Processing record: ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`);
      
      // Check if this period already exists in PostgreSQL
      const existingPgRecord = pgUsageQuery.rows.find(pgRecord => {
        const pgStart = new Date(pgRecord.period_start);
        const pgEnd = new Date(pgRecord.period_end);
        return pgStart.toISOString().split('T')[0] === periodStart.toISOString().split('T')[0] &&
               pgEnd.toISOString().split('T')[0] === periodEnd.toISOString().split('T')[0];
      });
      
      const pgRecordData = {
        users_id: pgUserId,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        videos_processed: airtableRecord.fields.videos_processed || 0,
        api_calls_made: airtableRecord.fields.api_calls_made || 0,
        storage_used_mb: airtableRecord.fields.storage_used_mb || 0,
        ai_summaries_generated: airtableRecord.fields.ai_summaries_generated || 0
        // Removed airtable_id since column doesn't exist
      };
      
      try {
        if (existingPgRecord) {
          // Update existing PostgreSQL record
          await database.update('subscription_usage', existingPgRecord.id, pgRecordData);
          console.log(`   ✅ Updated existing PostgreSQL record (ID: ${existingPgRecord.id})`);
        } else {
          // Create new PostgreSQL record
          const newRecord = await database.create('subscription_usage', pgRecordData);
          console.log(`   ✅ Created new PostgreSQL record (ID: ${newRecord.id})`);
        }
        
        console.log(`   📊 Synced: ${pgRecordData.videos_processed} videos, ${pgRecordData.api_calls_made} API calls`);
        
      } catch (syncError) {
        console.log(`   ❌ Failed to sync record: ${syncError.message}`);
        
        console.log(`   ⚠️  Skipping this record due to table structure mismatch`);
        console.log(`   🔧 You may need to adjust the PostgreSQL table structure`);
      }
    }
    
    // 5. Verify the sync
    console.log('\n🔍 VERIFYING SYNC:');
    console.log('==================');
    
    const verifyQuery = await database.query(
      'SELECT * FROM subscription_usage WHERE users_id = $1 ORDER BY period_start DESC',
      [pgUserId]
    );
    
    console.log(`📊 PostgreSQL now has ${verifyQuery.rows.length} usage records for this user`);
    
    if (verifyQuery.rows.length > 0) {
      const latestRecord = verifyQuery.rows[0];
      console.log(`✅ Latest record: ${latestRecord.videos_processed || 0} videos processed`);
    }
    
    console.log('\n🎯 SYNC COMPLETE');
    console.log('================');
    console.log('✅ Subscription usage records have been synced from Airtable to PostgreSQL');
    console.log('🔄 The website should now display the correct video counts');
    
  } catch (error) {
    console.error('❌ Error syncing subscription usage:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run the sync
async function main() {
  try {
    await syncSubscriptionUsage();
    console.log('\n✨ Sync completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { syncSubscriptionUsage };