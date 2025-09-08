const database = require('./src/services/database.service');
const { logger } = require('./src/utils');

async function loadUserSubscription() {
  try {
    console.log('🔄 Loading user subscription data from CSV...');
    
    // First, find the user by email to get their PostgreSQL ID
    const userEmail = 'social@vizyul.com';
    const users = await database.findByField('users', 'email', userEmail);
    
    if (users.length === 0) {
      throw new Error(`User not found with email: ${userEmail}`);
    }
    
    const user = users[0];
    const userId = user.fields ? user.fields.id : user.id;
    console.log(`Found user: ${userEmail} with ID: ${userId}`);
    
    // Prepare the subscription data
    const subscriptionData = {
      stripe_subscription_id: 'sub_1S3iqT4WKHcK2S1U7T03qe0o',
      users_id: userId, // Note: using users_id (plural) as per PostgreSQL schema
      stripe_customer_id: 'cus_SziGGmiqIGzTl0',
      subscription_tier: 'enterprise',
      status: 'active',
      current_period_start: '2025-09-04',
      current_period_end: '2025-10-04',
      cancel_at_period_end: false,
      trial_start: null,
      trial_end: null,
      created_at: '2025-09-04T00:00:00.000Z',
      updated_at: new Date().toISOString()
    };
    
    console.log('Subscription data to insert:', subscriptionData);
    
    // Check if subscription already exists
    const existingSubscriptions = await database.findByField(
      'user_subscriptions', 
      'stripe_subscription_id', 
      subscriptionData.stripe_subscription_id
    );
    
    if (existingSubscriptions.length > 0) {
      console.log('Subscription already exists, updating...');
      const existingId = existingSubscriptions[0].id || existingSubscriptions[0].fields.id;
      const updated = await database.update('user_subscriptions', existingId, subscriptionData);
      console.log('✅ Updated subscription record:', updated.id);
    } else {
      console.log('Creating new subscription record...');
      const created = await database.create('user_subscriptions', subscriptionData);
      console.log('✅ Created subscription record:', created.id);
    }
    
    // Verify the data was inserted correctly
    const verification = await database.findByField('user_subscriptions', 'users_id', userId);
    console.log(`\n✅ Verification: Found ${verification.length} subscription(s) for user ${userId}`);
    
    verification.forEach(sub => {
      const data = sub.fields || sub;
      console.log({
        id: sub.id,
        stripe_subscription_id: data.stripe_subscription_id,
        users_id: data.users_id,
        subscription_tier: data.subscription_tier,
        status: data.status,
        current_period_start: data.current_period_start,
        current_period_end: data.current_period_end
      });
    });
    
  } catch (error) {
    console.error('❌ Error loading subscription:', error);
  } finally {
    await database.close();
  }
}

loadUserSubscription();