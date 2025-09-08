const database = require('./src/services/database.service');
const { logger } = require('./src/utils');

async function loadUserPreferences() {
  try {
    console.log('🔄 Loading user preferences data from CSV...');
    
    // First, find the user by email to get their PostgreSQL ID
    const userEmail = 'social@vizyul.com';
    const users = await database.findByField('users', 'email', userEmail);
    
    if (users.length === 0) {
      throw new Error(`User not found with email: ${userEmail}`);
    }
    
    const user = users[0];
    const userId = user.fields ? user.fields.id : user.id;
    console.log(`Found user: ${userEmail} with ID: ${userId}`);
    
    // Parse the CSV data into preference record
    const preferenceData = {
      preference_key: 'd2302e82-4b74-429c-a0aa-59c8f78b6e78',
      users_id: userId, // Foreign key to users table
      theme_mode: 'light',
      llm: 'gemini',
      preference_value: '', // Empty in CSV
      email_notifications: true, // "checked" in CSV
      marketing_communications: false, // Empty in CSV (default false)
      weekly_digest: true, // "checked" in CSV
      is_active: true, // Default true (empty in CSV)
      created_at: '2025-09-03T10:48:00.000Z',
      updated_at: '2025-09-07T02:04:00.000Z'
    };
    
    console.log('Preference data to insert:', preferenceData);
    
    // Check if preference already exists by preference_key
    const existingPreferences = await database.findByField(
      'user_preferences', 
      'preference_key', 
      preferenceData.preference_key
    );
    
    if (existingPreferences.length > 0) {
      console.log('Preference record already exists, updating...');
      const existingId = existingPreferences[0].id || existingPreferences[0].fields.id;
      const updated = await database.update('user_preferences', existingId, preferenceData);
      console.log('✅ Updated preference record:', updated.id);
    } else {
      console.log('Creating new preference record...');
      const created = await database.create('user_preferences', preferenceData);
      console.log('✅ Created preference record:', created.id);
    }
    
    // Verify the data was inserted correctly
    const verification = await database.findByField('user_preferences', 'users_id', userId);
    console.log(`\n✅ Verification: Found ${verification.length} preference record(s) for user ${userId}`);
    
    verification.forEach(pref => {
      const data = pref.fields || pref;
      console.log({
        id: pref.id,
        preference_key: data.preference_key,
        users_id: data.users_id,
        theme_mode: data.theme_mode,
        llm: data.llm,
        email_notifications: data.email_notifications,
        marketing_communications: data.marketing_communications,
        weekly_digest: data.weekly_digest,
        is_active: data.is_active
      });
    });
    
  } catch (error) {
    console.error('❌ Error loading preferences:', error);
  } finally {
    await database.close();
  }
}

loadUserPreferences();