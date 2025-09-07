// OAuth Service - Handles social login integrations
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const AppleStrategy = require('passport-apple').Strategy;
const authService = require('./auth.service');
const emailService = require('./email.service');
const logger = require('../utils/logger');
const crypto = require('crypto');

class OAuthService {
  constructor() {
    this.setupPassportStrategies();
  }

  setupPassportStrategies() {
    // Passport session setup
    passport.serializeUser((user, done) => {
      done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
      try {
        const user = await authService.findUserById(id);
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    });

    // Google OAuth Strategy
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
      }, this.handleOAuthCallback.bind(this, 'google')));
    }

    // Microsoft OAuth Strategy
    if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
      passport.use(new MicrosoftStrategy({
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/auth/microsoft/callback',
        scope: ['user.read']
      }, this.handleOAuthCallback.bind(this, 'microsoft')));
    }

    // Apple OAuth Strategy
    if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY) {
      passport.use(new AppleStrategy({
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        callbackURL: process.env.APPLE_CALLBACK_URL || '/auth/apple/callback',
        keyID: process.env.APPLE_KEY_ID,
        privateKeyString: process.env.APPLE_PRIVATE_KEY,
        scope: ['name', 'email'],
        passReqToCallback: true // Apple needs access to request for ID token
      }, this.handleAppleOAuthCallback.bind(this)));
      
      logger.info('Apple OAuth Strategy configured successfully');
    } else {
      logger.warn('Apple OAuth Strategy not configured - missing required environment variables');
    }
  }

  // Special handler for Apple OAuth (needs to decode ID token)
  async handleAppleOAuthCallback(req, accessToken, refreshToken, profile, jwtClaims, done) {
    try {
      logger.info('Apple OAuth callback received', {
        hasProfile: !!profile,
        hasJwtClaims: !!jwtClaims,
        profileKeys: Object.keys(profile || {}),
        jwtClaimsKeys: Object.keys(jwtClaims || {}),
        jwtClaims: jwtClaims
      });

      let userData = null;

      // Apple provides user data in the request body/query, not JWT claims
      let appleUserInfo = null;
      
      // Try to get user info from request body first (most common)
      if (req.body && req.body.user) {
        try {
          appleUserInfo = JSON.parse(req.body.user);
          logger.info('Apple user info from request body:', appleUserInfo);
        } catch (e) {
          logger.warn('Could not parse Apple user info from request body:', e.message);
        }
      }
      
      // Try to get user info from query params as fallback
      if (!appleUserInfo && req.query && req.query.user) {
        try {
          appleUserInfo = JSON.parse(req.query.user);
          logger.info('Apple user info from query params:', appleUserInfo);
        } catch (e) {
          logger.warn('Could not parse Apple user info from query params:', e.message);
        }
      }

      // Extract user data from Apple's response
      if (appleUserInfo && appleUserInfo.email) {
        userData = {
          email: appleUserInfo.email,
          firstName: appleUserInfo.name?.firstName,
          lastName: appleUserInfo.name?.lastName,
          profilePicture: null,
          isApplePrivateEmail: this.isApplePrivateEmail(appleUserInfo.email)
        };
        logger.info('Apple user data extracted from Apple response:', userData);
      } else if (jwtClaims && jwtClaims.email) {
        // Fallback to JWT claims if available
        userData = {
          email: jwtClaims.email,
          firstName: null,
          lastName: null,
          profilePicture: null,
          isApplePrivateEmail: this.isApplePrivateEmail(jwtClaims.email)
        };
        logger.info('Apple user data extracted from JWT claims:', userData);
      } else if (profile && profile.email) {
        // Final fallback to profile if available
        userData = {
          email: profile.email,
          firstName: profile.name?.firstName,
          lastName: profile.name?.lastName,
          profilePicture: null,
          isApplePrivateEmail: this.isApplePrivateEmail(profile.email)
        };
        logger.info('Apple user data extracted from profile:', userData);
      }

      // For subsequent Apple logins, Apple doesn't provide user data
      // We need to extract the user ID from JWT claims and find existing user
      if (!userData || !userData.email) {
        logger.info('Apple subsequent login - no user data provided, checking available data');
        logger.info('Available data debug:', {
          hasProfile: !!profile,
          hasJwtClaims: !!jwtClaims,
          hasAccessToken: !!accessToken,
          profileId: profile?.id,
          profileEmail: profile?.email,
          jwtClaimsKeys: jwtClaims ? Object.keys(jwtClaims) : null,
          jwtClaims: jwtClaims
        });
        
        // Try multiple ways to get user identifier
        let appleUserId = null;
        
        // Method 1: JWT claims sub
        if (jwtClaims && jwtClaims.sub) {
          appleUserId = jwtClaims.sub;
          logger.info('Method 1 - Found Apple user ID in JWT claims sub:', appleUserId);
        }
        // Method 2: Profile ID
        else if (profile && profile.id) {
          appleUserId = profile.id;
          logger.info('Method 2 - Found Apple user ID in profile ID:', appleUserId);
        }
        // Method 3: Profile email (if available)
        else if (profile && profile.email) {
          logger.info('Method 3 - Found email in profile, will lookup by email:', profile.email);
          
          // Find existing user by email instead of Apple ID
          const existingUserByEmail = await authService.findUserByEmail(profile.email);
          
          if (!existingUserByEmail) {
            throw new Error('No existing user found for this email. Please sign up first.');
          }
          
          logger.info(`Found existing Apple user by email: ${existingUserByEmail.email}`);
          return done(null, existingUserByEmail);
        }
        
        if (!appleUserId) {
          // Final fallback: For Apple subsequent logins, try to find the most recent Apple user
          logger.warn('No Apple user ID found - checking for recent Apple users as fallback');
          
          try {
            // Find the most recent Apple user (assumes single Apple user or most recent login)
            const recentAppleUser = await authService.findMostRecentAppleUser();
            
            if (recentAppleUser) {
              logger.info(`Using most recent Apple user as fallback: ${recentAppleUser.email}`);
              return done(null, recentAppleUser);
            } else {
              logger.warn('No Apple users found in database');
              return done(new Error('No Apple account found. Please sign up first or contact support.'), null);
            }
          } catch (fallbackError) {
            logger.error('Fallback Apple user lookup failed:', fallbackError);
            return done(new Error('Apple subsequent login failed. Please try signing up again.'), null);
          }
        }
        
        // Find existing user by Apple ID
        const existingUserByAppleId = await authService.findUserByAppleId(appleUserId);
        
        if (!existingUserByAppleId) {
          throw new Error('No existing user found for this Apple ID. Please sign up first.');
        }
        
        logger.info(`Found existing Apple user: ${existingUserByAppleId.email}`);
        
        // For subsequent logins, return the existing user directly
        return done(null, existingUserByAppleId);
      }

      logger.info('Apple OAuth user data extracted:', {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        isApplePrivateEmail: userData.isApplePrivateEmail
      });

      // Create a profile-like object for consistency with other providers
      const appleProfile = {
        id: userData.email, // Use email as ID since Apple doesn't provide a consistent user ID
        email: userData.email,
        name: {
          firstName: userData.firstName,
          lastName: userData.lastName
        },
        provider: 'apple'
      };

      // Use the standard OAuth callback logic
      return await this.handleOAuthCallback('apple', accessToken, refreshToken, appleProfile, done);

    } catch (error) {
      logger.error('Apple OAuth callback error:', {
        message: error.message,
        stack: error.stack
      });
      return done(error, null);
    }
  }

  async handleOAuthCallback(provider, accessToken, refreshToken, profile, done) {
    try {
      logger.info(`OAuth callback received for ${provider}`, { 
        profileId: profile.id, 
        email: profile.emails?.[0]?.value || profile.email,
        profileData: JSON.stringify(profile, null, 2)
      });

      // Extract user data from profile
      const userData = this.extractUserData(provider, profile);
      
      if (!userData.email) {
        throw new Error(`No email address provided by ${provider}`);
      }

      // Check if user already exists
      let existingUser = await authService.findUserByEmail(userData.email);
      
      logger.info(`OAuth flow for ${provider} - ${userData.email}:`, {
        userExists: !!existingUser,
        emailVerified: existingUser ? existingUser.emailVerified : null,
        welcomeEmailSent: existingUser ? existingUser.welcomeEmailSent : null
      });
      
      if (existingUser) {
        // Update existing user with OAuth info if needed
        const oauthIdField = `${provider.charAt(0).toUpperCase() + provider.slice(1)} ID`;
        
        // Check if this specific OAuth ID is already stored
        let needsUpdate = false;
        if (provider === 'google' && !existingUser.googleId) needsUpdate = true;
        if (provider === 'apple' && !existingUser.appleId) needsUpdate = true;  
        if (provider === 'microsoft' && !existingUser.microsoftId) needsUpdate = true;
        
        logger.info(`OAuth ID check for ${provider}:`, {
          provider,
          hasGoogleId: !!existingUser.googleId,
          hasAppleId: !!existingUser.appleId,
          hasMicrosoftId: !!existingUser.microsoftId,
          needsUpdate,
          profileId: profile.id
        });
        
        if (needsUpdate) {
          await authService.updateUser(existingUser.id, {
            [oauthIdField]: profile.id,
            'Updated At': new Date().toISOString()
          });
        }

        // If user exists and email is verified, log them in
        if (existingUser.emailVerified) {
          logger.info(`Existing verified user login for ${userData.email}:`, {
            id: existingUser.id,
            emailVerified: existingUser.emailVerified,
            status: existingUser.status,
            provider: provider
          });
          // Send welcome email ONLY if we haven't sent a welcome email before
          const hasReceivedWelcomeEmail = existingUser['Welcome Email Sent'] || existingUser.welcomeEmailSent || false;
          
          logger.info(`OAuth welcome email check for ${userData.email}:`, {
            'welcomeEmailSent': existingUser.welcomeEmailSent,
            'hasReceivedWelcomeEmail': hasReceivedWelcomeEmail
          });
          
          if (!hasReceivedWelcomeEmail) {
            try {
              const firstName = existingUser['First Name'] || existingUser.firstName || 'there';
              await emailService.sendWelcomeEmail(userData.email, firstName);
              
              // Mark that we've sent the welcome email
              await authService.updateUser(existingUser.id, {
                'Welcome Email Sent': true,
                'Welcome Email Sent At': new Date().toISOString()
              });
              
              logger.info(`Welcome email sent to existing user: ${userData.email}`);
            } catch (emailError) {
              logger.error('Failed to send welcome email to existing user:', emailError);
              // Don't fail the login if welcome email fails
            }
          } else {
            logger.info(`Skipping welcome email for ${userData.email} - already sent`);
          }
          
          logger.info('Returning existing user for token generation:', {
            id: existingUser.id,
            email: existingUser.email,
            emailVerified: existingUser.emailVerified,
            status: existingUser.status,
            firstName: existingUser.firstName
          });
          
          return done(null, existingUser);
        } else {
          // For Apple private emails, skip verification since they can't receive external emails
          if (provider === 'apple' && userData.isApplePrivateEmail) {
            logger.info(`Skipping email verification for Apple private relay: ${userData.email}`);
            
            // Mark email as verified and activate user
            await authService.updateUser(existingUser.id, {
              emailVerified: true,
              status: 'active',
              emailVerificationToken: null,
              emailVerificationExpires: null,
              subscription_tier: 'free',
              subscription_status: 'none'
            });
            
            // Send welcome email if not sent before
            const hasReceivedWelcomeEmail = existingUser.welcomeEmailSent || false;
            if (!hasReceivedWelcomeEmail) {
              try {
                const firstName = existingUser.firstName || 'there';
                await emailService.sendWelcomeEmail(userData.email, firstName);
                
                await authService.updateUser(existingUser.id, {
                  'Welcome Email Sent': true,
                  'Welcome Email Sent At': new Date().toISOString()
                });
                
                logger.info(`Welcome email sent to Apple private email user: ${userData.email}`);
              } catch (emailError) {
                logger.error('Failed to send welcome email to Apple user:', emailError);
                // Don't fail the login if welcome email fails
              }
            }
            
            // Update the user object with verified status for token generation
            const updatedUser = {
              ...existingUser,
              emailVerified: true,
              status: 'active'
            };
            
            return done(null, updatedUser);
          } else {
            // Regular email verification flow for non-Apple or regular Apple emails
            await this.sendVerificationForSocialUser(existingUser, userData.email);
            return done(null, { 
              pendingVerification: true, 
              email: userData.email, 
              provider: provider,
              isApplePrivateEmail: userData.isApplePrivateEmail || false 
            });
          }
        }
      }

      // Create new user 
      const newUser = await this.createPendingSocialUser(provider, profile.id, userData);
      
      // For Apple private emails, skip verification and activate immediately
      if (provider === 'apple' && userData.isApplePrivateEmail) {
        logger.info(`Skipping email verification for new Apple private relay user: ${userData.email}`);
        
        // Mark email as verified and activate user
        await authService.updateUser(newUser.id, {
          emailVerified: true,
          status: 'active',
          emailVerificationToken: null,
          emailVerificationExpires: null,
          subscription_tier: 'free',
          subscription_status: 'none'
        });
        
        // Send welcome email
        try {
          const firstName = newUser.firstName || 'there';
          await emailService.sendWelcomeEmail(userData.email, firstName);
          
          await authService.updateUser(newUser.id, {
            'Welcome Email Sent': true,
            'Welcome Email Sent At': new Date().toISOString()
          });
          
          logger.info(`Welcome email sent to new Apple private email user: ${userData.email}`);
        } catch (emailError) {
          logger.error('Failed to send welcome email to new Apple user:', emailError);
          // Don't fail the signup if welcome email fails
        }
        
        // Update the user object with verified status for token generation
        const updatedNewUser = {
          ...newUser,
          emailVerified: true,
          status: 'active'
        };
        
        return done(null, updatedNewUser);
      } else {
        // Regular email verification flow for non-Apple or regular Apple emails
        await this.sendVerificationForSocialUser(newUser, userData.email);
        
        return done(null, { 
          pendingVerification: true, 
          email: userData.email, 
          provider: provider,
          isApplePrivateEmail: userData.isApplePrivateEmail || false 
        });
      }

    } catch (error) {
      logger.error(`OAuth ${provider} callback error:`, {
        message: error.message,
        stack: error.stack,
        provider: provider,
        profileId: profile?.id,
        email: profile?.emails?.[0]?.value
      });
      return done(error, null);
    }
  }

  // Check if email is an Apple private relay email
  isApplePrivateEmail(email) {
    return email && (
      email.includes('@privaterelay.appleid.com') ||
      email.includes('@icloud.com') && email.includes('_') ||
      /^[a-z0-9]{8,}@privaterelay\.appleid\.com$/i.test(email)
    );
  }

  extractUserData(provider, profile) {
    const userData = {
      email: null,
      firstName: null,
      lastName: null,
      profilePicture: null,
      isApplePrivateEmail: false
    };

    switch (provider) {
    case 'google':
      userData.email = profile.emails?.[0]?.value;
      userData.firstName = profile.name?.givenName;
      userData.lastName = profile.name?.familyName;
      userData.profilePicture = profile.photos?.[0]?.value;
      break;
      
    case 'microsoft':
      userData.email = profile.emails?.[0]?.value;
      userData.firstName = profile.name?.givenName;
      userData.lastName = profile.name?.familyName;
      userData.profilePicture = profile.photos?.[0]?.value;
      break;
      
    case 'apple':
      userData.email = profile.email;
      userData.firstName = profile.name?.firstName;
      userData.lastName = profile.name?.lastName;
      userData.isApplePrivateEmail = this.isApplePrivateEmail(profile.email);
      break;
    }

    return userData;
  }

  async createPendingSocialUser(provider, providerId, userData) {
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const userFields = {
      'Email': userData.email,
      'First Name': userData.firstName,
      'Last Name': userData.lastName,
      'Email Verified': false,
      'Email Verification Token': verificationToken,
      'Email Verification Expires': verificationExpires.toISOString(),
      'Status': 'pending_verification',
      'Registration Method': provider,
      'Terms Accepted': true,
      'Privacy Accepted': true,
      'subscription_tier': 'free',
      'subscription_status': 'none',
      [`${provider.charAt(0).toUpperCase() + provider.slice(1)} ID`]: providerId,
      'Created At': new Date().toISOString(),
      'Updated At': new Date().toISOString()
    };

    if (userData.profilePicture) {
      userFields['Profile Picture URL'] = userData.profilePicture;
    }

    return await authService.createUser(userFields);
  }

  async sendVerificationForSocialUser(user, email) {
    try {
      // Generate verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const verificationToken = crypto.createHash('sha256').update(verificationCode).digest('hex');
      const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);

      // Update user with verification token
      await authService.updateUser(user.id, {
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires.toISOString()
      });

      // Send verification email
      await emailService.sendVerificationCode(email, verificationCode);
      
      logger.info(`Verification email sent to social login user: ${email}`);
    } catch (error) {
      logger.error('Failed to send verification email for social user:', {
        message: error.message,
        stack: error.stack,
        email: email,
        userId: user?.id
      });
      throw error;
    }
  }

  async completeSocialVerification(email, code) {
    try {
      const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
      const user = await authService.findUserByEmail(email);

      if (!user) {
        throw new Error('User not found');
      }

      const tokenExpires = new Date(user.emailVerificationExpires);
      if (tokenExpires < new Date()) {
        throw new Error('Verification code has expired');
      }

      if (user.emailVerificationToken !== hashedCode) {
        throw new Error('Invalid verification code');
      }

      // Update user as verified and complete
      const updateFields = {
        emailVerified: true,
        status: 'active',
        emailVerificationToken: null,
        emailVerificationExpires: null
      };

      await authService.updateUser(user.id, updateFields);

      // Send welcome email for new social users and mark as sent
      try {
        const firstName = user['First Name'] || user.firstName || 'there';
        await emailService.sendWelcomeEmail(email, firstName);
        
        // Mark that welcome email has been sent
        await authService.updateUser(user.id, {
          'Welcome Email Sent': true,
          'Welcome Email Sent At': new Date().toISOString()
        });
        
        logger.info(`Welcome email sent to social user: ${email}`);
      } catch (emailError) {
        logger.error('Failed to send welcome email to social user:', emailError);
        // Don't fail the verification if welcome email fails
      }

      // Generate JWT token
      const token = authService.generateToken(user.id, email, user);

      logger.info(`Social login user verified and activated: ${email}`);

      return {
        success: true,
        user: user,
        token: token
      };
    } catch (error) {
      logger.error('Social verification completion error:', error);
      throw error;
    }
  }

  // Initialize passport middleware
  initialize() {
    return passport.initialize();
  }

  session() {
    return passport.session();
  }

  // Authentication middleware for different providers
  authenticateGoogle() {
    return passport.authenticate('google', { 
      scope: ['profile', 'email'],
      prompt: 'select_account'
    });
  }

  authenticateMicrosoft() {
    return passport.authenticate('microsoft', {
      scope: ['user.read']
    });
  }

  authenticateApple() {
    return passport.authenticate('apple', {
      scope: ['name', 'email']
    });
  }

  // Callback handlers
  handleGoogleCallback() {
    return passport.authenticate('google', { 
      failureRedirect: '/auth/sign-in?error=oauth_failed',
      session: false
    });
  }

  handleMicrosoftCallback() {
    return passport.authenticate('microsoft', { 
      failureRedirect: '/auth/sign-in?error=oauth_failed',
      session: false
    });
  }

  handleAppleCallback() {
    return passport.authenticate('apple', { 
      failureRedirect: '/auth/sign-in?error=oauth_failed',
      session: false
    });
  }
}

module.exports = new OAuthService();