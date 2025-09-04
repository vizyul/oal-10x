# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Our AI Legacy" is a Node.js Express application with Handlebars templating and Airtable integration. It's an authentication-focused application for video content management, designed for ministry use.

## Development Commands

- **Start development**: `npm run dev` - Uses nodemon to watch for changes
- **Start production**: `npm start` - Runs the server directly
- **Run tests**: `npm test` - Executes Jest test suite
- **Lint code**: `npm run lint` - ESLint checks
- **Fix linting**: `npm run lint:fix` - Auto-fix linting issues

### Port Management (Windows)

If port 3000 is already in use when starting the dev server:

1. **Check what's using the port**:
   ```bash
   netstat -ano | findstr :3000
   ```

2. **Kill the process** (note the double slashes for Windows):
   ```bash
   taskkill //F //PID <process_id>
   ```

3. **Then restart the dev server**:
   ```bash
   npm run dev
   ```

## Architecture

### Core Structure
- **Entry point**: `src/server.js` - HTTP server setup with graceful shutdown
- **App configuration**: `src/app.js` - Express app setup, middleware, and routing
- **MVC Pattern**: Controllers, services, middleware, and Handlebars views

### Key Components

**Authentication Flow**:
- JWT-based authentication with bcryptjs password hashing
- Multi-step signup process (3 steps) with email verification
- OAuth integration for Google, Apple, and Microsoft with email validation
- Protected routes using auth middleware
- Cookie-based session management

**Airtable Integration**:
- Primary data storage via `airtable.service.js`
- User data management and content tracking
- Setup scripts: `setup-airtable-tables.js` for table configuration

**OAuth Integration**:
- `oauth.service.js` handles Google, Apple, and Microsoft authentication
- Email verification required for all social logins
- Social verification page with 6-digit code validation
- Automatic user creation and account linking

**Middleware Stack**:
- Security: Helmet, CORS, rate limiting, input validation
- Authentication: JWT verification, optional auth for public pages
- Error handling: Global error middleware with logging

**View System**:
- Handlebars templating with custom helpers (eq, ne, gt, lt, and, or, formatDate, json)
- Layouts: `main.hbs` for general pages, `auth.hbs` for authentication
- Responsive design with separate auth and main stylesheets

### Directory Structure

```
src/
├── config/          # Environment and database configuration
├── controllers/     # Request handlers
│   └── auth.controller.js
├── middleware/      # Authentication, security, validation, error handling
│   ├── auth.middleware.js
│   ├── error.middleware.js
│   ├── security.middleware.js
│   └── validation.middleware.js
├── routes/          # Express routes (auth, API, main)
│   ├── api.routes.js
│   ├── auth.routes.js    # Includes OAuth routes and social verification
│   ├── index.js
│   └── main.routes.js
├── services/        # Business logic (Airtable, auth, email, OAuth)
│   ├── airtable.service.js
│   ├── auth.service.js
│   ├── email.service.js
│   └── oauth.service.js  # NEW: Google, Apple, Microsoft OAuth
├── utils/           # Helpers, validators, logger
│   ├── logger.js
│   └── validators.js
├── views/           # Handlebars templates and layouts
│   ├── auth/
│   │   ├── signin.hbs
│   │   ├── signup.hbs
│   │   ├── signup-step1.hbs  # Includes social login buttons
│   │   ├── signup-step2.hbs
│   │   ├── signup-step3.hbs
│   │   └── social-verify.hbs # NEW: Social login email verification
│   ├── errors/
│   │   └── 501.hbs
│   ├── layouts/
│   │   ├── auth.hbs
│   │   └── main.hbs
│   ├── partials/
│   │   └── header.hbs
│   ├── contact.hbs
│   └── index.hbs
├── app.js           # Express app setup with Passport initialization
└── server.js        # HTTP server with graceful shutdown

public/
├── css/
│   ├── auth.css     # Updated with social login styles
│   ├── header.css   # Updated logout button styles
│   └── main.css
├── js/
│   ├── auth.js      # Updated with social login handlers
│   └── main.js
└── images/

.env.example         # Updated with OAuth environment variables
package.json         # Updated with OAuth packages (passport, etc.)
```

## Testing

- **Framework**: Jest
- **Structure**: Separate unit and integration test directories
- **Setup**: Test helpers in `tests/helpers/setup.js`
- **Coverage**: Authentication routes and services

## Deployment

- **Platform**: Railway (configured with `railway.json`)
- **Environment**: Production-ready with trust proxy settings
- **Health check**: `/health` endpoint for monitoring
- **Process management**: Graceful shutdown handling for SIGTERM/SIGINT

## Environment Requirements

- **Node.js**: >=18.0.0
- **Environment variables**: Actual configuration is in `.env` file (not `.env.example`)
- **Airtable**: API key and base configuration needed
- **OAuth Providers**: Google, Apple, and Microsoft app configurations required

### Important Notes
- **Always check `.env` file for actual environment variables**, not `.env.example`
- The `.env.example` is just a template - real values are in `.env`

### OAuth Configuration

To enable social login, configure OAuth applications and add these environment variables:

**Google OAuth** (Google Cloud Console):
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` 
- `GOOGLE_CALLBACK_URL` (default: http://localhost:3000/auth/google/callback)

**Microsoft OAuth** (Azure AD):
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_CALLBACK_URL` (default: http://localhost:3000/auth/microsoft/callback)

**Apple OAuth** (Apple Developer Console):
- `APPLE_CLIENT_ID` (Service ID)
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY` (Private key file content)
- `APPLE_CALLBACK_URL` (default: http://localhost:3000/auth/apple/callback)

Social logins require email verification before account activation.

## Key Files for Modification

- **Routes**: Add new routes in `src/routes/`
- **Business logic**: Add services in `src/services/`
- **Authentication**: Modify `src/middleware/auth.middleware.js`
- **OAuth Integration**: `src/services/oauth.service.js` for social login modifications
- **UI**: Update Handlebars templates in `src/views/`
- **Styles**: CSS files in `public/css/`

## Key Dependencies

### OAuth & Authentication:
- `passport` - Authentication middleware
- `passport-google-oauth20` - Google OAuth strategy
- `passport-apple` - Apple OAuth strategy  
- `passport-microsoft` - Microsoft OAuth strategy
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT tokens

### Core Framework:
- `express` - Web application framework
- `express-handlebars` - Templating engine
- `airtable` - Database integration
- `nodemailer` - Email sending
- `@microsoft/microsoft-graph-client` - Microsoft Graph API
- to memorize