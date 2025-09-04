require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const airtable = require('./src/services/airtable.service');
const stripeService = require('./src/services/stripe.service');
const { logger } = require('./src/utils');

/**
 * Utility script to manually sync subscription data from Stripe
 * This is useful when webhooks aren't properly configured in development
 */
async function syncSubscriptionData() {
  try {
    const customerId = 'cus_SzRa9JZoLXmTEM';
    const userEmail = 'social@vizyul.com';
    
    console.log(`Syncing subscription data for customer: ${customerId}`);
    
    // Get customer from Stripe
    const customer = await stripe.customers.retrieve(customerId);
    console.log('Customer retrieved:', customer.email);
    
    // Get subscriptions for customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all'
    });
    
    if (subscriptions.data.length === 0) {
      console.log('No subscriptions found for this customer');
      return;
    }
    
    const subscription = subscriptions.data[0];
    console.log('Subscription found:', {
      id: subscription.id,
      status: subscription.status,
      priceId: subscription.items.data[0].price.id,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      trial_start: subscription.trial_start,
      trial_end: subscription.trial_end
    });
    
    // Find user by email
    const users = await airtable.findByField('Users', 'email', userEmail);
    if (!users || users.length === 0) {
      console.error('User not found:', userEmail);
      return;
    }
    
    const user = users[0];
    console.log('User found:', user.id);
    
    // Determine tier from price ID
    const priceId = subscription.items.data[0].price.id;
    let tier = 'basic'; // default
    
    if (priceId === process.env.STRIPE_BASIC_PRICE_ID || priceId === process.env.STRIPE_BASIC_YEARLY_PRICE_ID) {
      tier = 'basic';
    } else if (priceId === process.env.STRIPE_PREMIUM_PRICE_ID || priceId === process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID) {
      tier = 'premium';  
    } else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID || priceId === process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID) {
      tier = 'enterprise';
    }
    
    console.log('Determined tier:', tier);
    
    // Update user record
    await airtable.update('Users', user.id, {
      subscription_tier: tier,
      subscription_status: subscription.status,
      stripe_customer_id: customerId
    });
    console.log('User record updated');
    
    // Check if subscription record already exists
    const existingSubscriptions = await airtable.findByField(
      'User_Subscriptions', 
      'stripe_subscription_id', 
      subscription.id
    );
    
    if (existingSubscriptions && existingSubscriptions.length > 0) {
      console.log('Subscription record already exists, updating...');
      const subscriptionRecord = existingSubscriptions[0];
      
      await airtable.update('User_Subscriptions', subscriptionRecord.id, {
        subscription_tier: tier,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end
      });
      console.log('Subscription record updated');
    } else {
      console.log('Creating new subscription record...');
      
      // Create subscription record
      await airtable.create('User_Subscriptions', {
        user_id: [user.id],
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        subscription_tier: tier,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
      });
      console.log('Subscription record created');
    }
    
    // Create usage record for current billing period
    await airtable.create('Subscription_Usage', {
      user_id: [user.id],
      subscription_id: subscription.id,
      period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      videos_processed: 0,
      api_calls_made: 0,
      storage_used_mb: 0,
      ai_summaries_generated: 0,
      analytics_views: 0
    });
    console.log('Usage record created');
    
    console.log('✅ Subscription sync completed successfully!');
    
  } catch (error) {
    console.error('❌ Error syncing subscription:', error);
  }
}

// Run the sync if this file is executed directly
if (require.main === module) {
  syncSubscriptionData().then(() => {
    process.exit(0);
  });
}

module.exports = syncSubscriptionData;