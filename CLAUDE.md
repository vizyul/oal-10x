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

## Architecture

### Core Structure
- **Entry point**: `src/server.js` - HTTP server setup with graceful shutdown
- **App configuration**: `src/app.js` - Express app setup, middleware, and routing
- **MVC Pattern**: Controllers, services, middleware, and Handlebars views

### Key Components

**Authentication Flow**:
- JWT-based authentication with bcryptjs password hashing
- Multi-step signup process (3 steps) with email verification
- Protected routes using auth middleware
- Cookie-based session management

**Airtable Integration**:
- Primary data storage via `airtable.service.js`
- User data management and content tracking
- Setup scripts: `setup-airtable-tables.js` for table configuration

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
├── middleware/      # Authentication, security, validation, error handling
├── routes/          # Express routes (auth, API, main)
├── services/        # Business logic (Airtable, auth, email)
├── utils/           # Helpers, validators, logger
└── views/           # Handlebars templates and layouts
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
- **Environment variables**: Required setup via `.env.example`
- **Airtable**: API key and base configuration needed

## Key Files for Modification

- **Routes**: Add new routes in `src/routes/`
- **Business logic**: Add services in `src/services/`
- **Authentication**: Modify `src/middleware/auth.middleware.js`
- **UI**: Update Handlebars templates in `src/views/`
- **Styles**: CSS files in `public/css/`