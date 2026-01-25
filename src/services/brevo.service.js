/**
 * BREVO CRM Integration Service
 *
 * Handles contact synchronization with BREVO CRM:
 * - Trial users (signup) -> TrialUsers list
 * - Paid subscribers -> Subscribers list
 * - Cancellations -> Remove from Subscribers list
 */

const { logger } = require('../utils');

// BREVO API configuration
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const TRIAL_USERS_LIST_ID = parseInt(process.env.BREVO_TRIAL_USERS_LIST_ID) || 3;
const SUBSCRIBERS_LIST_ID = parseInt(process.env.BREVO_SUBSCRIBERS_LIST_ID) || 4;

let contactsApi = null;

/**
 * Initialize BREVO client lazily
 */
function initBrevoClient() {
  if (!BREVO_API_KEY) {
    logger.warn('BREVO_API_KEY not configured - BREVO integration disabled');
    return false;
  }

  if (contactsApi) {
    return true;
  }

  try {
    const brevo = require('@getbrevo/brevo');
    contactsApi = new brevo.ContactsApi();
    contactsApi.setApiKey(brevo.ContactsApiApiKeys.apiKey, BREVO_API_KEY);

    logger.info('BREVO client initialized successfully');
    return true;
  } catch (error) {
    logger.error('Failed to initialize BREVO client:', error.message);
    return false;
  }
}

/**
 * Add a new trial user to BREVO CRM
 * Called after successful signup completion
 *
 * @param {Object} userData - User data from signup
 * @param {string} userData.email - User email address
 * @param {string} userData.firstName - User first name
 * @param {string} userData.lastName - User last name
 * @param {number|string} userData.userId - User ID
 */
async function addTrialUser(userData) {
  if (!initBrevoClient()) {
    logger.info('Skipping BREVO trial user add - client not configured');
    return null;
  }

  const { email, firstName, lastName, userId } = userData;

  try {
    const createContact = {
      email: email,
      attributes: {
        FIRSTNAME: firstName || '',
        LASTNAME: lastName || '',
        USER_ID: String(userId),
        HAS_SUBSCRIPTION: false,
        SIGNUP_DATE: new Date().toISOString().split('T')[0]
      },
      listIds: [TRIAL_USERS_LIST_ID],
      updateEnabled: true // Update if contact already exists
    };

    const result = await contactsApi.createContact(createContact);

    logger.info('BREVO: Added trial user successfully', {
      email,
      userId,
      listId: TRIAL_USERS_LIST_ID
    });

    return result;
  } catch (error) {
    const errorBody = error.response?.body || error.body || {};
    const errorCode = errorBody.code;

    // Handle duplicate contact gracefully
    if (errorCode === 'duplicate_parameter') {
      logger.info('BREVO: Contact already exists, updating attributes', { email });

      try {
        const updateContact = {
          attributes: {
            FIRSTNAME: firstName || '',
            LASTNAME: lastName || '',
            USER_ID: String(userId),
            HAS_SUBSCRIPTION: false
          },
          listIds: [TRIAL_USERS_LIST_ID]
        };

        await contactsApi.updateContact(email, updateContact);
        logger.info('BREVO: Updated existing contact', { email });
        return { updated: true };
      } catch (updateError) {
        logger.error('BREVO: Failed to update existing contact:', {
          email,
          error: updateError.message
        });
      }
    } else {
      logger.error('BREVO: Failed to add trial user:', {
        email,
        error: error.message,
        responseBody: errorBody
      });
    }

    // Don't throw - BREVO errors should not fail main operations
    return null;
  }
}

/**
 * Add contact to Subscribers list when they purchase a subscription
 * Also updates HAS_SUBSCRIPTION attribute to true
 *
 * @param {string} email - User email address
 * @param {string} planName - Subscription plan name (e.g., 'basic', 'premium')
 */
async function addToSubscribersList(email, planName) {
  if (!initBrevoClient()) {
    logger.info('Skipping BREVO subscriber add - client not configured');
    return null;
  }

  try {
    const updateContact = {
      attributes: {
        HAS_SUBSCRIPTION: true,
        SUBSCRIPTION_PLAN: planName || 'unknown',
        SUBSCRIPTION_DATE: new Date().toISOString().split('T')[0]
      },
      listIds: [SUBSCRIBERS_LIST_ID]
    };

    await contactsApi.updateContact(email, updateContact);

    logger.info('BREVO: Added contact to Subscribers list', {
      email,
      planName,
      listId: SUBSCRIBERS_LIST_ID
    });

    return { success: true };
  } catch (error) {
    const errorBody = error.response?.body || error.body || {};
    const errorCode = errorBody.code;

    // If contact doesn't exist, create them
    if (errorCode === 'document_not_found') {
      logger.info('BREVO: Contact not found, creating new contact', { email });

      try {
        const createContact = {
          email: email,
          attributes: {
            HAS_SUBSCRIPTION: true,
            SUBSCRIPTION_PLAN: planName || 'unknown',
            SUBSCRIPTION_DATE: new Date().toISOString().split('T')[0]
          },
          listIds: [SUBSCRIBERS_LIST_ID]
        };

        await contactsApi.createContact(createContact);
        logger.info('BREVO: Created new subscriber contact', { email, planName });
        return { created: true };
      } catch (createError) {
        logger.error('BREVO: Failed to create subscriber contact:', {
          email,
          error: createError.message
        });
      }
    } else {
      logger.error('BREVO: Failed to add to Subscribers list:', {
        email,
        error: error.message,
        responseBody: errorBody
      });
    }

    return null;
  }
}

/**
 * Remove contact from Subscribers list when subscription is canceled
 * Also updates HAS_SUBSCRIPTION attribute to false
 *
 * @param {string} email - User email address
 */
async function removeFromSubscribersList(email) {
  if (!initBrevoClient()) {
    logger.info('Skipping BREVO subscriber removal - client not configured');
    return null;
  }

  try {
    // First, update HAS_SUBSCRIPTION to false
    const updateContact = {
      attributes: {
        HAS_SUBSCRIPTION: false,
        CANCELLATION_DATE: new Date().toISOString().split('T')[0]
      },
      unlinkListIds: [SUBSCRIBERS_LIST_ID]
    };

    await contactsApi.updateContact(email, updateContact);

    logger.info('BREVO: Removed contact from Subscribers list', {
      email,
      listId: SUBSCRIBERS_LIST_ID
    });

    return { success: true };
  } catch (error) {
    const errorBody = error.response?.body || error.body || {};
    const errorCode = errorBody.code;

    // Contact not found is acceptable - they may not be in BREVO
    if (errorCode === 'document_not_found') {
      logger.info('BREVO: Contact not found for removal (may not exist)', { email });
      return { notFound: true };
    }

    logger.error('BREVO: Failed to remove from Subscribers list:', {
      email,
      error: error.message,
      responseBody: errorBody
    });

    return null;
  }
}

/**
 * Check if BREVO integration is configured and available
 *
 * @returns {boolean} True if BREVO is configured
 */
function isConfigured() {
  return !!BREVO_API_KEY;
}

module.exports = {
  addTrialUser,
  addToSubscribersList,
  removeFromSubscribersList,
  isConfigured
};
