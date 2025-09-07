#!/usr/bin/env node

/**
 * Add processed_at field to videos table in PostgreSQL
 */

const database = require('./src/services/database.service');

async function addProcessedAtField() {
  try {
    console.log('🔧 Adding processed_at field to PostgreSQL videos table...');
    
    // Check if the field already exists
    console.log('🔍 Checking if processed_at field already exists...');
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'videos' 
      AND column_name = 'processed_at'
    `;
    
    const checkResult = await database.query(checkQuery);
    
    if (checkResult.rows.length > 0) {
      console.log('✅ processed_at field already exists in videos table');
      return;
    }
    
    // Add the processed_at field
    console.log('➕ Adding processed_at field...');
    const addFieldQuery = `
      ALTER TABLE videos 
      ADD COLUMN processed_at TIMESTAMP DEFAULT NULL
    `;
    
    await database.query(addFieldQuery);
    
    console.log('✅ Successfully added processed_at field to videos table');
    
    // Verify the field was added
    console.log('🔍 Verifying field was added...');
    const verifyResult = await database.query(checkQuery);
    
    if (verifyResult.rows.length > 0) {
      console.log('✅ Verification successful - processed_at field is now available');
    } else {
      console.log('❌ Verification failed - field may not have been added correctly');
    }
    
    console.log('\n📋 Next steps:');
    console.log('1. Add processed_at field to your Airtable Videos table manually');
    console.log('   - Go to Airtable Videos table');
    console.log('   - Add field: processed_at (Date and time with time included)');
    console.log('2. Restart your application to use the new field');
    
  } catch (error) {
    console.error('❌ Error adding processed_at field:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run the migration
async function main() {
  try {
    await addProcessedAtField();
    console.log('\n✨ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { addProcessedAtField };