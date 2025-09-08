/**
 * Redirect utilities for handling post-authentication redirects
 */

/**
 * Determine the redirect URL based on user's subscription tier
 * @param {Object} user - User object
 * @returns {string} - Redirect URL
 */
function getPostAuthRedirectUrl(user) {
  const subscriptionTier = user?.subscription_tier || 'free';

  // Free subscription users should go to upgrade page
  if (subscriptionTier === 'free') {
    return '/subscription/upgrade';
  }

  // All other subscription tiers go to videos page
  return '/videos';
}

module.exports = {
  getPostAuthRedirectUrl
};
