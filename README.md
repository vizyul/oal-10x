# AmplifyContent.ai Application

A modern Node.js Express application with Handlebars templating and Airtable integration.

## Features

- **Authentication System**: Complete signup/signin with email verification
- **Airtable Integration**: Seamless data management with Airtable as backend
- **Security**: Helmet, rate limiting, input validation, and JWT authentication
- **Modern UI**: Handlebars templating with responsive design
- **Railway Ready**: Configured for deployment on Railway platform

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: Airtable
- **Templating**: Handlebars
- **Authentication**: JWT, bcryptjs
- **Security**: Helmet, express-rate-limit, express-validator
- **Deployment**: Railway

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure your environment variables
4. Start the development server: `npm run dev`

## Environment Variables

See `.env.example` for required environment variables.

## API Documentation

API documentation is available in `docs/api.md`.

## Deployment

This application is configured for deployment on Railway. See `docs/deployment.md` for details.

## License

MIT
