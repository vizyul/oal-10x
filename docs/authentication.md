# Authentication System Documentation

This document explains how the OAuth integration and authentication system works in Our AI Legacy application.

## Overview

Our application supports multiple authentication methods:
- **Email/Password** - Traditional username/password authentication
- **Google OAuth** - Sign in with Google account
- **Apple OAuth** - Sign in with Apple ID
- **Microsoft OAuth** - Sign in with Microsoft account

## OAuth Integration Process (First Time)

### Authentication Flow

```
User clicks "Continue with Google/Apple/Microsoft"
↓
Redirected to OAuth provider (Google/Apple/Microsoft)
↓
User signs in and authorizes our app
↓
Provider redirects back to our callback URL with authorization code
↓
Our server exchanges code for access token + user info
↓
We create/link user account in our database
↓
We generate our own JWT token
↓
JWT stored in HTTP-only cookie
```

### Technical Implementation

1. **Initiation**: User clicks OAuth button → Redirect to `/auth/{provider}`
2. **Authorization**: Provider handles user authentication and consent
3. **Callback**: Provider redirects to `/auth/{provider}/callback` with authorization code
4. **Token Exchange**: Our server exchanges code for access token and user information
5. **User Management**: Create new user or link existing account in database
6. **Session Creation**: Generate JWT token and store in secure HTTP-only cookie

## Return Login Process

### How Users Sign In Again

#### Option 1: Using Our App's Session (Most Common)
- ✅ **User visits our app**
- ✅ **Our server checks the JWT cookie**
- ✅ **If JWT is valid and not expired → User is logged in**
- ❌ **No calls to Google/Apple/Microsoft APIs needed**

#### Option 2: JWT Expired - OAuth Re-authentication
- ✅ **User visits our app**
- ❌ **JWT cookie is expired/invalid**
- ✅ **User clicks "Continue with Google/Apple/Microsoft" again**
- ✅ **OAuth provider recognizes user and may auto-approve**
- ✅ **New JWT generated and stored in cookie**

## Data Storage

### In Our Database (Airtable)

```javascript
{
  email: "user@example.com",
  firstName: "John",
  lastName: "Doe",
  googleId: "google-user-id-123",     // Links to Google account
  appleId: "apple-user-id-456",       // Links to Apple account  
  microsoftId: "microsoft-user-id-789", // Links to Microsoft account
  emailVerified: true,
  registrationMethod: "google", // Which method they first used
  "Registration Method": "google", // Airtable field format
  "Welcome Email Sent": true, // Prevents duplicate welcome emails
  "Welcome Email Sent At": "2025-09-01T12:00:00.000Z"
}
```

### In Browser Cookie

```javascript
{
  auth_token: "JWT-TOKEN-HERE", // Our own JWT, not OAuth provider token
  // Contains: userId, email, expiration (7 days default)
}
```

### What's NOT Stored

- ❌ **OAuth access tokens** (we don't store these long-term)
- ❌ **OAuth refresh tokens** (we don't use these for login)
- ❌ **Provider-specific session data**

## Daily Login Flow

### Typical User Experience

1. **User visits our app** → Our server checks JWT cookie
2. **If JWT valid** → User automatically logged in (no API calls)
3. **If JWT expired** → User sees sign-in page
4. **User clicks OAuth button** → Quick re-authorization
5. **Provider may auto-approve** (if user previously authorized)
6. **New JWT created** → User logged in

## Code Implementation

### JWT Cookie Validation (Every Request)

```javascript
// middleware/auth.middleware.js
const token = req.cookies.auth_token;
const decoded = jwt.verify(token, JWT_SECRET);
// If valid → req.user = decoded user info
// If invalid → redirect to sign-in
```

### OAuth Callback Handler

```javascript
// services/oauth.service.js
// 1. Exchange code for access token
// 2. Get user info from provider  
// 3. Find existing user by email
// 4. Generate new JWT
// 5. Set cookie and redirect to dashboard
```

## API Calls Made

### During Active Session
- ✅ **Zero API calls** to Google/Apple/Microsoft
- ✅ **Only calls to our own database** (Airtable)

### During Re-authentication
- ✅ **One-time call** to OAuth provider's token endpoint
- ✅ **One-time call** to OAuth provider's user info endpoint
- ✅ **Database call** to update/link user account

## Session Management

### Our JWT Token
- **Default Duration**: 7 days (`JWT_EXPIRES_IN=7d`)
- **Cookie Settings**: HTTP-only, secure in production
- **Renewal**: Only when user re-authenticates via OAuth

### Provider Sessions
- **Google/Apple/Microsoft**: Handle their own sessions independently
- **User may stay logged in** to provider separately
- **Auto-approval**: Provider may skip consent screen for returning users

## Welcome Email System

### Email Sending Logic
- **New email users**: Welcome email sent after registration completion
- **New OAuth users**: Welcome email sent after first successful authentication
- **Existing users**: Welcome email sent only on first OAuth integration (if not sent before)
- **Tracking**: `Welcome Email Sent` field prevents duplicate emails

### Implementation
- Email service supports both Microsoft Graph API and SMTP
- Welcome emails include support contact information
- Graceful error handling - authentication continues even if email fails

## Security Features

### Authentication Security
1. **No long-term OAuth tokens stored**
2. **Provider sessions are independent** 
3. **Our JWT handles day-to-day authentication**
4. **Fresh OAuth verification** when JWT expires
5. **User can revoke access** at provider level anytime

### Email Duplicate Prevention
- Email uniqueness enforced across all signup methods
- Existing users logging in with OAuth have accounts linked, not duplicated
- Cross-method authentication supported (can use email or OAuth interchangeably)

## OAuth Provider Configuration

### Google OAuth
- **Environment Variables**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- **Callback URL**: `https://dev.ourailegacy.com/auth/google/callback`
- **Scopes**: Basic profile information and email

### Apple OAuth  
- **Environment Variables**: `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_CALLBACK_URL`
- **Callback URL**: `https://dev.ourailegacy.com/auth/apple/callback`
- **Method**: POST callback (unlike Google/Microsoft which use GET)
- **Data Source**: User information comes from request body/query, not profile object

### Microsoft OAuth
- **Environment Variables**: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL`  
- **Callback URL**: `https://dev.ourailegacy.com/auth/microsoft/callback`
- **Scopes**: Basic profile information and email

## Development vs Production

### Development Setup
- **HTTPS Required**: All OAuth providers require HTTPS callbacks
- **Local Domain**: Using `dev.ourailegacy.com` with SSL certificates
- **Port**: Running on port 443 for proper HTTPS

### Production Considerations
- **Cookie Security**: `secure: true` flag for HTTPS
- **CORS Configuration**: Properly configured for production domain
- **SSL Certificates**: Valid certificates for production domain

## Troubleshooting

### Common Issues
1. **Apple OAuth empty profile**: Apple provides user data in request body, not profile object
2. **Microsoft duplicate welcome emails**: Fixed with welcome email tracking system
3. **Email validation on page load**: Fixed with interaction-based validation
4. **Port requirements**: Apple requires standard HTTPS port (443)

### Debugging
- Detailed logging in OAuth service shows provider responses
- JWT validation errors logged with specific failure reasons
- Email service logs success/failure for all email operations

## File Structure

```
src/
├── controllers/
│   └── auth.controller.js          # Email/password authentication
├── services/
│   ├── oauth.service.js            # OAuth provider integration
│   ├── auth.service.js             # User management
│   └── email.service.js            # Welcome/verification emails
├── middleware/
│   └── auth.middleware.js          # JWT validation
└── routes/
    └── auth.routes.js              # All authentication routes
```

---

**In summary:** Once integrated, users primarily use our own JWT-based session system for daily logins, with OAuth only needed when that session expires (every 7 days by default). This provides a seamless user experience while maintaining security and independence from OAuth provider availability.