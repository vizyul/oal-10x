/**
 * Redirect utilities for handling post-authentication redirects
 */

/**
 * Determine the redirect URL based on user's subscription tier
 * @param {Object} user - User object
 * @returns {string} - Redirect URL
 */
function getPostAuthRedirectUrl(user) {
  // All users go to video upload page after authentication
  return '/videos/upload';
}

module.exports = {
  getPostAuthRedirectUrl
};
