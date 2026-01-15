# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## System Environment

**Operating System**: Windows 11

### CRITICAL: Windows-Only Commands
**NEVER use Unix/Linux/Mac commands. This is a STRICT requirement.**

**FORBIDDEN commands (will create errors or artifacts):**
- `ls` → Use `dir` instead
- `cat` → Use `type` instead (or use the Read tool)
- `rm` → Use `del` for files, `rmdir` for directories
- `rm -rf` → Use `rmdir /s /q`
- `touch` → Use `echo. >` or `type nul >`
- `cp` → Use `copy`
- `mv` → Use `move`
- `grep` → Use `findstr` (or use the Grep tool)
- `pwd` → Use `cd` with no arguments
- `chmod` → Not applicable on Windows
- `/dev/null` → Use `NUL` (but avoid redirecting to null entirely)
- `cd /d` with path → Just use `cd` (the `/d` causes parsing issues)

**ALWAYS prefer Claude Code's built-in tools over shell commands:**
- Use `Read` tool instead of `type` or `cat`
- Use `Glob` tool instead of `dir` with patterns
- Use `Grep` tool instead of `findstr`
- Use `Edit` tool instead of text manipulation commands
- Use `Write` tool instead of `echo >` redirects

**Other Windows notes:**
- PowerShell and Command Prompt both available
- Use `netstat -ano | findstr :PORT` to check ports
- Use `taskkill //F //PID <process_id>` to kill processes

## Project Overview

"AmplifyContent.ai" is a Node.js Express application with Handlebars templating and Airtable integration. It's an authentication-focused application for video content management, designed for business use.

**Database Architecture**: This application has been fully migrated from Airtable to PostgreSQL as the primary database.
- **PostgreSQL** (primary) - Main data storage for all application data
- **Migration Status**: Complete - all Airtable functionality now uses PostgreSQL
- **Schema**: Normalized design with proper relationships and foreign keys
- **Data Integrity**: All single-select fields and relationships properly migrated

### Previous Airtable Videos Table Fields (Legacy Reference):
**Note**: These fields are for reference only as the application now uses PostgreSQL.
**Available Fields:**
- `Id` (Primary Field, Number)
- `blog` (Button)
- `blog_text` (Long text)
- `blog_url` (URL)
- `channel_handle` (Single line text) - YouTube channel handle
- `Channel` (Button)
- `channel_name` (Single line text)
- `chapter` (Button)
- `chapter_text` (Single line text)
- `chapter_url` (URL)
- `created_at` (Created time)
- `description` (Long text) ✅
- `discussion` (Button)
- `discussion_guide_text` (Long text)
- `discussion_guide_url` (URL)
- `duration` (Number) ✅
- `Last Modified` (Date)
- `podcast` (Button)
- `podcast_text` (Long text)
- `podcast_url` (URL)
- `quiz` (Button)
- `quiz_text` (Long text)
- `quiz_url` (URL)
- `quote_list` (Single line text)
- `quotes` (Button)
- `quotes_url` (URL)
- `recid` (Long text)
- `thumbnail` (Attachment) ✅
- `transcript` (Button)
- `transcript_text` (Long text)
- `transcript_url` (URL)
- `upload_date` (Date) ✅
- `user_id` (Link to another record)
- `video_title` (Single line text)
- `videoid` (Long text)
- `VidUsers` (Single line text)
- `Workflows` (Single line text)
- `youtube_url` (Single line text)

**Key Import Fields Available:**
- Basic video info: `youtube_url`, `videoid`, `video_title`, `channel_name`, `channel_handle`
- Media: `thumbnail` (Attachment format), `duration` (Number)
- Content: `description` (Long text), `upload_date` (Date)
- Processing: `status`, `category`, `privacy_setting` (newly added fields)
- User association: `user_id` (Link to another record)

## PostgreSQL Database Schema

The application now uses a normalized PostgreSQL database with proper relationships and foreign keys. All Airtable single-select fields have been migrated to VARCHAR columns with appropriate defaults.

### Core Tables

#### users (57 columns)
Primary user data with OAuth integration and comprehensive profile fields:
- **Identity**: `id`, `email`, `first_name`, `last_name`, `password`
- **Verification**: `email_verified`, `email_verification_token`, `email_verification_expires`
- **Authentication**: `oauth_provider`, `oauth_id` (normalized design vs separate provider columns)
- **Status**: `status` (active), `role` (user/admin), `subscription_tier` (free/basic/premium/creator/enterprise)
- **Profile**: `profile_image_url`, `phone`, `date_of_birth`, `gender`, `location`, `bio`, `website_url`
- **Social**: `social_links` (JSONB), `preferences` (JSONB), `metadata` (JSONB)
- **Subscription**: `stripe_customer_id`, `subscription_status`, `subscription_plan`, `trial_end`
- **Security**: `two_factor_enabled`, `api_key_hash`, `session_token`, `magic_link_token`
- **Tracking**: `last_login`, `login_count`, `usage_count`, `monthly_usage_limit`
- **Timestamps**: `created_at`, `updated_at`

**Key Design**: OAuth uses normalized `oauth_provider` + `oauth_id` instead of separate `google_id`, `apple_id`, `microsoft_id` columns.

#### sessions (24 columns)
Session tracking with proper duration calculation and timezone handling:
- **Identity**: `id`, `session_id`, `users_id` (FK to users)
- **User Info**: `user_email`, `login_method` (email/google/apple/microsoft)
- **Device**: `ip_address`, `user_agent`, `device_type` (desktop/mobile/tablet), `browser`, `os`
- **Status**: `status` (active/expired/logged_out), `is_active` (boolean)
- **Timing**: `created_at`, `updated_at`, `last_accessed`, `last_activity_at`, `ended_at`
- **Duration**: `duration` (DECIMAL(5,2) - hours.minutes format, e.g., 2.30 = 2h 30m)
- **Location**: `location`, `timezone`
- **Legacy**: `expires_at`, `session_data` (JSONB), `device_info` (JSONB), `location_data` (JSONB)

**Duration Format**: Uses DECIMAL(5,2) for easy aggregation (0.15=15min, 1.30=1h30m, 2.45=2h45m)
**Duration Calculation**: PostgreSQL handles timezone-safe calculation using EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))

#### user_subscriptions (15 columns)
Stripe subscription management:
- **Identity**: `id`, `users_id` (FK to users), `stripe_subscription_id`
- **Plan**: `plan_name`, `subscription_tier` (free/basic/premium/creator/enterprise), `price_id`
- **Status**: `status`, `current_period_start`, `current_period_end`
- **Trial**: `trial_start`, `trial_end`
- **Data**: `metadata` (JSONB), `airtable_id`
- **Timestamps**: `created_at`, `updated_at`

#### subscription_usage (21 columns)
Comprehensive usage tracking with all Airtable fields migrated:
- **Identity**: `id`, `user_subscriptions_id` (FK to user_subscriptions)
- **Period**: `usage_type`, `period_start`, `period_end`, `reset_date`
- **Core Usage**: `usage_count`, `usage_limit`, `videos_processed` (key monthly limit field)
- **Feature Usage**: `ai_summaries_generated`, `analytics_views`, `api_calls_made`, `storage_used_mb`
- **Additional**: `feature_used`, `ip_address`, `user_agent`
- **Reference**: `subscription_id` (Stripe ID), `user_id` (direct user reference)
- **Data**: `metadata` (JSONB)
- **Timestamps**: `created_at`, `updated_at`

**Key Field**: `videos_processed` tracks monthly video processing for subscription limits.

#### subscription_events (16 columns)
Webhook and event processing:
- **Identity**: `id`, `user_subscriptions_id` (FK), `stripe_event_id`
- **Event**: `event_type`, `event_data` (JSONB)
- **Processing**: `processed` (boolean), `processed_successfully` (boolean), `status` (pending/processed/failed)
- **Timing**: `created_at`, `updated_at`, `processed_at`, `webhook_received_at`
- **Error Handling**: `error_message`, `retry_count`
- **Reference**: `stripe_subscription_id`, `user_id`

### Key Relationships

```
users (1) ←→ (M) user_subscriptions ←→ (M) subscription_usage
users (1) ←→ (M) sessions  
users (1) ←→ (M) subscription_events
user_subscriptions (1) ←→ (M) subscription_usage
user_subscriptions (1) ←→ (M) subscription_events
```

### Database Migration Status

✅ **Completed Migrations:**
- All single-select fields from Airtable (status, device_type, login_method, etc.)
- User authentication with OAuth normalization
- Session tracking with proper duration calculation
- Subscription usage data with all tracking fields
- Foreign key constraints and data integrity

✅ **Key Fixes Applied:**
- Duration field: DECIMAL(5,2) format with PostgreSQL-based calculation
- Timezone handling: Database-native timestamp calculations
- OAuth design: Normalized provider/ID columns vs separate provider columns
- Subscription relationships: Proper FK chains for usage tracking

## UI/UX Guidelines

**CRITICAL: NO JavaScript Popup Dialogs**: 
- **NEVER use JavaScript alert(), confirm(), or prompt() functions** in any UI components or frontend code
- **ALWAYS use inline HTML error/success messaging** with proper styling for user notifications  
- **Use styled notification banners** that appear at the top of pages or within forms
- **Implement custom modal dialogs** for confirmations when absolutely necessary
- **Provide auto-dismissing messages** with manual close buttons for better UX
- **Include smooth animations** (slide-in/fade) for showing/hiding messages

**Rationale**: JavaScript popup dialogs are disruptive, not accessible, unprofessional, and break modern web UX patterns. This application requires enterprise-grade user interface standards.

## Development Commands

- **Start development**: `npm run dev` - Uses nodemon to watch for changes
- **Start production**: `npm start` - Runs the server directly
- **Run tests**: `npm test` - Executes Jest test suite
- **Code linting**: `npm run lint` - Check code quality with ESLint v9
- **Auto-fix lint issues**: `npm run lint:fix` - Automatically fix fixable ESLint issues
- **Code validation**: Use `node -c <filename>` for syntax checking

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

**PostgreSQL Integration**:
- Primary data storage via `database.service.js` (normalized schema)
- User authentication with OAuth normalization (provider + ID columns)
- Session management with DECIMAL duration tracking (database-calculated)
- Subscription and usage tracking with comprehensive metrics
- All services migrated from Airtable to PostgreSQL with improved relationships

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
├── services/        # Business logic (PostgreSQL-based, auth, email, OAuth, video processing, AI)
│   ├── ai-chat.service.js  # Google Gemini & OpenAI ChatGPT integration
│   ├── auth.service.js     # PostgreSQL-based authentication with OAuth normalization
│   ├── content-generation.service.js  # AI content generation from transcripts
│   ├── database.service.js  # Core PostgreSQL service (primary database)
│   ├── email.service.js
│   ├── oauth.service.js  # Google, Apple, Microsoft OAuth
│   ├── session.service.js  # Session management with DECIMAL duration tracking
│   ├── subscription.service.js  # Stripe subscription and usage tracking
│   ├── transcript.service.js  # YouTube transcript extraction with AI content trigger
│   ├── youtube-metadata.service.js  # YouTube Data API integration
│   └── youtube-oauth.service.js  # YouTube OAuth for channel access
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

- **Framework**: Jest with comprehensive configuration
- **Coverage Requirements**: 80% minimum for branches, functions, lines, and statements
- **Structure**: Separate unit and integration test directories
- **Setup**: Test helpers in `tests/helpers/setup.js` with HTTPS and OAuth mock support
- **Environment**: Configured for Apple OAuth testing on `dev.ourailegacy.com:4433`

### Test Commands

- `npm test` - Full test suite with linting precheck and coverage
- `npm run test:unit` - Unit tests only (`tests/unit/`)
- `npm run test:integration` - Integration tests only (`tests/integration/`)
- `npm run test:coverage` - Tests with coverage report
- `npm run test:watch` - Tests in watch mode for development
- `npm run test:ci` - CI-optimized test run (no watch, coverage, pass with no tests)
- `npm run validate` - Complete validation: lint + test:ci

### Current Test Status

**✅ Working Tests:**
- `tests/unit/database.service.test.js` - 9 comprehensive tests for PostgreSQL database service
- All tests pass and provide good coverage of core database operations

**📋 Tests Needing Updates (Currently Disabled):**
- `tests/unit/auth.test.js.disabled` - 21 tests for auth service (needs PostgreSQL migration updates)
- `tests/integration/auth.routes.test.js.disabled` - 16 tests for auth routes (needs mock updates for new architecture)
- `tests/integration/api.routes.test.js.disabled` - API route tests (needs service reference updates)

### Testing Next Steps

**Priority 1: Update Unit Tests**
1. **Auth Service Tests** (`tests/unit/auth.test.js.disabled`):
   - Update mocks from `airtableService` to `database` service
   - Change expected calls from Airtable format to PostgreSQL format
   - Update field mappings (e.g., `'Email'` → `email`, `'First Name'` → `first_name`)
   - Fix formatUserRecord expectations for PostgreSQL schema

**Priority 2: Update Integration Tests**
2. **Auth Routes Tests** (`tests/integration/auth.routes.test.js.disabled`):
   - Fix service mock setup for `emailService.sendVerificationEmail`
   - Update response expectations (some routes return 302 redirects instead of JSON)
   - Verify OAuth redirect flows work with new PostgreSQL user model
   - Update JWT token verification tests

3. **API Routes Tests** (`tests/integration/api.routes.test.js.disabled`):
   - Update service imports from `airtableService` to `database`
   - Fix mock configurations for PostgreSQL architecture
   - Update expected response formats

**Priority 3: Add New Test Coverage**
4. **Missing Service Tests**:
   - `subscription.service.js` - Usage tracking and billing
   - `stripe.service.js` - Payment processing
   - `transcript.service.js` - YouTube transcript extraction
   - `content-generation.service.js` - AI content generation

5. **Controller Tests**:
   - `videos.controller.js` - Video CRUD operations
   - `youtube.controller.js` - YouTube integration
   - `subscription.controller.js` - Subscription management

### Test Architecture Notes

- **PostgreSQL Testing**: All tests should use mocked `database.service` instead of `airtableService`
- **Mock Environment**: Tests configured with proper OAuth test credentials
- **HTTPS Testing**: Supports Apple OAuth requirements with `dev.ourailegacy.com:4433`
- **Coverage Goals**: Maintain 80% coverage across all metrics as codebase grows
- **CI Integration**: Tests run automatically with `npm run validate` command

### Example Test Update Pattern

When updating disabled tests, follow this pattern:
```javascript
// OLD (Airtable):
const airtableService = require('../../src/services/airtable.service');
jest.mock('../../src/services/airtable.service');
airtableService.create.mockResolvedValue(mockRecord);
expect(airtableService.create).toHaveBeenCalledWith('Users', {
  'Email': 'test@example.com',
  'First Name': 'John'
});

// NEW (PostgreSQL):
const database = require('../../src/services/database.service');
jest.mock('../../src/services/database.service');
database.create.mockResolvedValue(mockRecord);
expect(database.create).toHaveBeenCalledWith('users', {
  email: 'test@example.com',
  first_name: 'John'
});
```

## Deployment

- **Platform**: Railway (configured with `railway.json`)
- **Environment**: Production-ready with trust proxy settings
- **Health check**: `/health` endpoint for monitoring
- **Process management**: Graceful shutdown handling for SIGTERM/SIGINT

## Environment Requirements

- **Node.js**: >=18.0.0
- **Environment variables**: Actual configuration is in `.env` file (not `.env.example`)
- **PostgreSQL**: Primary database connection (fully migrated from Airtable)
- **OAuth Providers**: Google, Apple, and Microsoft app configurations required
- **YouTube Data API**: API key for video metadata extraction
- **Transcript API**: Custom API key for YouTube transcript extraction
- **AI Services**: OpenAI and Google Gemini API keys for content generation

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

### Transcript Extraction Configuration

The application automatically extracts transcripts for imported YouTube videos using a custom API:

**Environment Variable**:
```env
TRANSCRIPT_API_KEY=YT5!u1G/}/ukX1Pb+WhCbX/1*Ene/j*2dt-wkJhu/Q1Kb[cPae{yz@A72Yub@
```

**API Endpoint**: `https://io.ourailegacy.com/api/appify/get-transcript`

**Features**:
- Automatic transcript extraction during video import
- Dual-database storage (both Airtable and PostgreSQL)
- Asynchronous processing (doesn't block video import)
- Graceful fallback when transcripts aren't available
- Batch processing support for multiple videos

**Implementation**:
- `transcript.service.js` - Core transcript extraction service
- Integrated into `youtube.controller.js` import workflow
- Stores results in `transcript_text` fields of both databases
- Automatically triggers AI content generation after transcript extraction

### AI Content Generation System

The application automatically generates additional content from video transcripts using AI:

**Supported AI Providers**:
- **Google Gemini** (via `@google/generative-ai`)
- **OpenAI ChatGPT** (via `openai` package)

**Environment Variables**:
```env
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

**Generated Content Types**:
- **Blog Posts** - Comprehensive articles from video content
- **Discussion Guides** - Questions for group conversations
- **Podcast Scripts** - Audio-optimized content
- **Quiz Questions** - Comprehension assessments
- **Quote Extractions** - Shareable key insights

**Database Schema**:
- `ai_prompts` table stores customizable prompts for each content type and AI provider
- Prompts can be updated without code changes
- Different prompts optimized for Gemini vs ChatGPT

**Implementation**:
- `ai-chat.service.js` - Core AI communication service
- `content-generation.service.js` - Content generation workflow
- `scripts/setup-ai-prompts-table.js` - Database setup script
- Automatic generation triggered after transcript extraction
- Results stored in video content fields (both databases)

## Core Service Architecture

### Database Service (`database.service.js`)
The primary PostgreSQL service providing:
- **CRUD Operations**: `create()`, `findById()`, `findByField()`, `update()`, `delete()`
- **Connection Management**: Pool-based connections with proper error handling
- **Query Interface**: Direct SQL query execution with parameter binding
- **Transaction Support**: For complex multi-table operations

### Authentication Service (`auth.service.js`)
OAuth-normalized user management:
- **OAuth Normalization**: Single `oauth_provider` + `oauth_id` columns vs separate provider columns
- **Field Mapping**: Proper PostgreSQL column mapping (email vs Email, first_name vs 'First Name')
- **Password Security**: bcryptjs hashing with proper salt rounds
- **Token Management**: JWT generation and verification

### Session Service (`session.service.js`)
Advanced session tracking:
- **Duration Tracking**: DECIMAL(5,2) format (2.30 = 2h 30m) for easy aggregation
- **Timezone Safety**: PostgreSQL EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) calculation
- **Device Detection**: Browser, OS, device type from User-Agent
- **Location Tracking**: IP geolocation and timezone detection

### Subscription Service (`subscription.service.js`)
Comprehensive usage and billing:
- **Usage Tracking**: `videos_processed`, `ai_summaries_generated`, `analytics_views`, `api_calls_made`
- **Stripe Integration**: Webhook processing and subscription management
- **Relationship Management**: Proper FK chains (users → user_subscriptions → subscription_usage)
- **Period Calculations**: Monthly usage windows with proper reset logic

## Key Files for Modification

- **Routes**: Add new routes in `src/routes/`
- **Business logic**: Add services in `src/services/` (PostgreSQL-based)
- **Authentication**: Modify `src/middleware/auth.middleware.js`
- **OAuth Integration**: `src/services/oauth.service.js` for social login modifications
- **Database Operations**: `src/services/database.service.js` for all data operations
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

## Test and Debug Scripts

When creating temporary test scripts, debug scripts, or utility scripts for debugging purposes:

- **ALWAYS name them with prefixes** like `test-`, `debug-`, `check-`, or similar
- These files are **automatically excluded from git** via .gitignore patterns
- **Clean up temporary scripts** when debugging is complete
- **Examples**: `test-user-subscription.js`, `debug-auth.js`, `check-database.js`

The .gitignore file already includes patterns like:
- `test-*.js`
- `debug-*.js` 
- `check-*.js`

This ensures debugging scripts are never accidentally committed to the repository.

### User Management Commands

#### User Reset Command
When the user asks to **"reset user X"**, this means:
1. Delete all videos for that user from the `videos` table
2. Reset their `videos_processed` count to 0 in the `subscription_usage` table

Use the script: `node adhoc/reset-user-videos.js <userId>`

#### User Deletion Command
When the user asks to **"delete user XX"** where XX is the user ID, this means:
**Completely delete the user and ALL related data from the PostgreSQL database.**

Use the script: `node adhoc/delete-user.js <userId> --force`

**What gets deleted:**
- User record from `users` table (deleted LAST)
- All foreign key references (deleted FIRST in proper order):
  - `subscription_events` (user_id)
  - `subscription_usage` (user_id and via user_subscriptions)
  - `user_subscriptions` (users_id)
  - `sessions` (users_id)
  - `user_preferences` (users_id)
  - `user_youtube_channels` (users_id)
  - `youtube_oauth_tokens` (users_id)
  - `videos` (users_id)
  - `api_keys` (users_id)
  - `audit_log` (users_id)

**WARNING**: This action is irreversible and permanently removes ALL user data.

**Usage Examples:**
- Interactive mode: `node adhoc/delete-user.js 44` (requires confirmation)
- Force mode: `node adhoc/delete-user.js 44 --force` (skips confirmations)

# Important Instruction Reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Please stop trying to use the rm (remove) comand. This is a windows computer
- Create a folder for all debugging and test scripts call adhoc and exclude this folder from source control. Then move all non project related files from the root of the project into that folder
- NEVER use Javascript dialog boxes like alert, confirm, or prompt for any reason. Use modern enterprise alerting techniques only