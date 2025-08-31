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
        scope: ['name', 'email']
      }, this.handleOAuthCallback.bind(this, 'apple')));
    }
  }

  async handleOAuthCallback(provider, accessToken, refreshToken, profile, done) {
    try {
      logger.info(`OAuth callback received for ${provider}`, { 
        profileId: profile.id, 
        email: profile.emails?.[0]?.value 
      });

      // Extract user data from profile
      const userData = this.extractUserData(provider, profile);
      
      if (!userData.email) {
        throw new Error(`No email address provided by ${provider}`);
      }

      // Check if user already exists
      let existingUser = await authService.findUserByEmail(userData.email);
      
      if (existingUser) {
        // Update existing user with OAuth info if needed
        const oauthIdField = `${provider.charAt(0).toUpperCase() + provider.slice(1)} ID`;
        
        // Check if this specific OAuth ID is already stored
        let needsUpdate = false;
        if (provider === 'google' && !existingUser.googleId) needsUpdate = true;
        if (provider === 'apple' && !existingUser.appleId) needsUpdate = true;  
        if (provider === 'microsoft' && !existingUser.microsoftId) needsUpdate = true;
        
        if (needsUpdate) {
          await authService.updateUser(existingUser.id, {
            [oauthIdField]: profile.id,
            'Updated At': new Date().toISOString()
          });
        }

        // If user exists and email is verified, log them in
        if (existingUser.emailVerified) {
          return done(null, existingUser);
        } else {
          // If email not verified, send verification email
          await this.sendVerificationForSocialUser(existingUser, userData.email);
          return done(null, { pendingVerification: true, email: userData.email });
        }
      }

      // Create new user with pending verification status
      const newUser = await this.createPendingSocialUser(provider, profile.id, userData);
      
      // Send verification email
      await this.sendVerificationForSocialUser(newUser, userData.email);
      
      return done(null, { pendingVerification: true, email: userData.email });

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

  extractUserData(provider, profile) {
    const userData = {
      email: null,
      firstName: null,
      lastName: null,
      profilePicture: null
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

      // Generate JWT token
      const token = authService.generateToken(user.id, email);

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