const database = require('./src/services/database.service');

async function addLlmColumn() {
  try {
    console.log('🔄 Adding llm column to user_preferences table...');
    
    // Add the llm column with default value 'gemini'
    const alterQuery = `
      ALTER TABLE user_preferences 
      ADD COLUMN llm VARCHAR(50) DEFAULT 'gemini'
    `;
    
    await database.query(alterQuery);
    console.log('✅ Added llm column with default value "gemini"');
    
    // Update any existing records to have the default value
    const updateQuery = `
      UPDATE user_preferences 
      SET llm = 'gemini' 
      WHERE llm IS NULL
    `;
    
    const updateResult = await database.query(updateQuery);
    console.log(`✅ Updated ${updateResult.rowCount} existing records with default llm value`);
    
    // Verify the column was added
    const schema = await database.getTableSchema('user_preferences');
    const llmColumn = schema.columns.find(col => col.column_name === 'llm');
    
    if (llmColumn) {
      console.log('✅ Verification: llm column exists');
      console.log(`   Type: ${llmColumn.data_type}`);
      console.log(`   Default: ${llmColumn.column_default}`);
      console.log(`   Nullable: ${llmColumn.is_nullable}`);
    } else {
      console.log('❌ Column not found after creation');
    }
    
  } catch (error) {
    console.error('❌ Error adding llm column:', error);
  } finally {
    await database.close();
  }
}

addLlmColumn();