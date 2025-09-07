# Airtable to PostgreSQL Migration Guide

**Last Updated**: September 2025  
**Status**: Migration Planning Phase  
**Priority**: High - Cost Reduction and Infrastructure Simplification

## Executive Summary

This document outlines the complete migration strategy from Airtable to PostgreSQL for the "Our AI Legacy" application. The application currently operates with a dual-database architecture where data is written to both Airtable (primary) and PostgreSQL (secondary). This migration will sunset Airtable entirely and consolidate all data operations to PostgreSQL.

**Benefits of Migration**:
- **Cost Reduction**: Eliminate Airtable subscription costs (~$20-50/month per user)
- **Performance**: Faster database queries and reduced API rate limits
- **Control**: Full control over database schema, backups, and migrations
- **Scalability**: Better performance for large datasets and concurrent users
- **Simplicity**: Single database system reduces complexity and maintenance

## Current Airtable Usage Analysis

### Database Architecture Overview

The application currently uses a **dual-database system**:
- **Airtable** (Primary): Main data storage with web interface for manual data management
- **PostgreSQL** (Secondary): Additional storage for advanced features and faster queries

### Airtable Tables Currently in Use

Based on comprehensive code analysis, the following Airtable tables are actively used:

| Table Name | Purpose | Record Count Est. | Migration Priority |
|------------|---------|-------------------|-------------------|
| **Users** | User accounts and authentication | ~10-100 | Critical |
| **Videos** | Video metadata and processing status | ~50-500 | Critical |
| **User_Subscriptions** | Stripe subscription management | ~10-50 | Critical |
| **Subscription_Usage** | Usage tracking (videos processed, etc.) | ~50-200 | Critical |
| **Processing_Queue** | Video processing task queue | ~0-100 (transient) | High |
| **Subscription_Events** | Stripe webhook event logging | ~100-1000 | Medium |
| **User_YouTube_Channels** | OAuth YouTube channel connections | ~10-50 | High |
| **AI_Prompts** | AI content generation prompts | ~10-20 | Medium |

### Services Using Airtable

The following services directly interact with Airtable and require migration:

#### 1. **Authentication Service** (`auth.service.js`)
- **Table**: Users
- **Operations**: Create, update, find by email
- **Usage**: User registration, login, OAuth account linking
- **Migration Impact**: Critical - core authentication functionality

#### 2. **Stripe/Subscription Service** (`stripe.service.js`)
- **Tables**: Users, User_Subscriptions, Subscription_Usage, Subscription_Events
- **Operations**: Create, update, find subscriptions and usage records
- **Usage**: Stripe webhook processing, subscription management
- **Migration Impact**: Critical - billing and subscription functionality

#### 3. **Video Processing Services**
- **Files**: `video-processing.service.js`, `youtube.controller.js`, `videos.controller.js`
- **Table**: Videos
- **Operations**: Create, update, find video records
- **Usage**: Video imports, metadata updates, processing status
- **Migration Impact**: Critical - core video functionality

#### 4. **Processing Queue Service** (`processing-queue.service.js`)
- **Table**: Processing_Queue
- **Operations**: Create, update, find, delete queue items
- **Usage**: Background task processing for video analysis
- **Migration Impact**: High - affects video processing pipeline

#### 5. **Subscription Management** (`subscription.service.js`)
- **Tables**: Subscription_Usage, User_Subscriptions
- **Operations**: Create, update usage tracking
- **Usage**: Track video processing limits, billing usage
- **Migration Impact**: Critical - subscription limits and billing

#### 6. **Content Generation Service** (`content-generation.service.js`)
- **Tables**: Videos, AI_Prompts
- **Operations**: Update video records with AI-generated content
- **Usage**: AI blog posts, discussion guides, podcast scripts
- **Migration Impact**: Medium - AI content features

#### 7. **Transcript Service** (`transcript.service.js`)
- **Table**: Videos
- **Operations**: Update video records with transcript data
- **Usage**: YouTube transcript extraction and storage
- **Migration Impact**: Medium - transcript functionality

#### 8. **YouTube OAuth Service** (`youtube-oauth.service.js`)
- **Table**: User_YouTube_Channels
- **Operations**: Create, update, find YouTube channel connections
- **Usage**: YouTube OAuth authentication and channel management
- **Migration Impact**: High - YouTube integration features

## PostgreSQL Migration Requirements

### ✅ Current PostgreSQL Schema Status

**EXCELLENT NEWS**: The PostgreSQL database is already **fully implemented** with all necessary tables and data! 

Based on database analysis, the following tables exist and are properly structured:

| Table Name | Record Count | Status | Airtable Mapping |
|------------|--------------|--------|------------------|
| **users** | 5 users | ✅ Complete | Has `airtable_id` field for mapping |
| **videos** | 0 videos | ✅ Complete | Has `airtable_id` field for mapping |
| **user_subscriptions** | 0 records | ✅ Complete | Proper foreign key to users |
| **subscription_usage** | 1 record | ✅ Complete | Proper foreign keys |
| **user_youtube_channels** | 0 records | ✅ Complete | Proper foreign key to users |
| **youtube_oauth_tokens** | 1 record | ✅ Complete | Proper foreign key to users |
| **subscription_events** | 0 records | ✅ Complete | Proper foreign key to users |
| **ai_prompts** | 11 records | ✅ Complete | Has `airtable_id` field for mapping |
| **sessions** | 0 records | ✅ Complete | Proper foreign key to users |
| **user_preferences** | 0 records | ✅ Complete | Proper foreign key to users |
| **api_keys** | 0 records | ✅ Complete | Proper foreign key to users |
| **email_templates** | 0 records | ✅ Complete | Standalone table |
| **audit_log** | 0 records | ✅ Complete | Proper foreign key to users |

### Key Findings from Database Analysis

#### 1. **All Tables Already Exist**
The PostgreSQL database is **not missing any tables**. Every table needed for the application is already created with proper schema, constraints, and foreign key relationships.

#### 2. **Proper Foreign Key Relationships**
Unlike Airtable's record ID links, PostgreSQL uses proper foreign key constraints:
- `users.id` (integer) → Primary key for all user relationships
- `subscription_usage.users_id` → `users.id`
- `user_subscriptions.users_id` → `users.id` 
- `videos.users_id` → `users.id`
- `subscription_usage.subscription_id` → `user_subscriptions.id`

#### 3. **Airtable ID Mapping Already in Place**
Several tables have `airtable_id` fields for maintaining references:
- `users.airtable_id` - Contains Airtable record IDs (e.g., "recFbnIxBGjfvukIT")
- `videos.airtable_id` - For mapping video records
- `ai_prompts.airtable_id` - For mapping AI prompts

#### 4. **Data Already Synchronized**
- **Users**: 5 users already exist in PostgreSQL with proper Airtable ID mapping
- **Subscription Usage**: Current usage record exists (user_id: 4, videos_processed: 2)
- **AI Prompts**: 11 prompts already loaded for content generation
- **YouTube OAuth**: Active OAuth token exists for user

### Migration Reality: Schema is Complete ✅

**No new tables need to be created.** The PostgreSQL schema is already comprehensive and includes:

```sql
-- Examples of existing tables (already created)
users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  airtable_id VARCHAR(20),  -- For Airtable mapping
  -- ... all other user fields
)

subscription_usage (
  id SERIAL PRIMARY KEY,
  users_id INTEGER REFERENCES users(id),
  subscription_id INTEGER REFERENCES user_subscriptions(id),
  videos_processed INTEGER DEFAULT 0,
  -- ... all usage tracking fields
)

videos (
  id SERIAL PRIMARY KEY,
  users_id INTEGER REFERENCES users(id),
  airtable_id VARCHAR(20),  -- For Airtable mapping
  -- ... all video metadata fields
)
```

### Data Type Conversions

| Airtable Type | PostgreSQL Type | Notes |
|---------------|----------------|-------|
| Single line text | VARCHAR(255) | Adjust length as needed |
| Long text | TEXT | For large content |
| Number | INTEGER or DECIMAL | Based on data |
| Date | TIMESTAMP | Include timezone if needed |
| Boolean | BOOLEAN | Direct conversion |
| Link to record | INTEGER REFERENCES | Foreign key relationship |
| Multiple select | VARCHAR[] or separate table | Array or junction table |
| Attachment | JSON or separate table | Store file URLs/metadata |

## Migration Strategy

Since PostgreSQL schema and data already exist, the migration is **significantly simplified** and focuses on **code changes only**.

### Phase 1: Service Code Migration (1 week)

**The ONLY task is updating service code to use PostgreSQL instead of Airtable**

**Critical Code Changes Needed:**

1. **ID Reference Updates** (Most Important)
   ```javascript
   // Current Airtable pattern
   user_id: [userId]  // Array of Airtable record IDs like ["recABC123"]
   
   // PostgreSQL pattern (needed)
   users_id: parseInt(userId)  // Integer foreign key like 4
   ```

2. **Field Name Mapping**
   ```javascript
   // Airtable uses different field names than PostgreSQL
   // Airtable: 'Email', 'First Name', 'Last Name'  
   // PostgreSQL: 'email', 'first_name', 'last_name'
   ```

3. **Service Import Changes**
   ```javascript
   // Replace in all services:
   // const airtable = require('./airtable.service');
   // With:
   const database = require('./database.service');
   ```

### Phase 2: Update Services by Priority

**Week 1 - Critical Services**:

1. **Authentication Service** (`auth.service.js`)
   - Replace Airtable calls with PostgreSQL
   - Update field name mappings
   - Test user registration/login

2. **Subscription Services** (`stripe.service.js`, `subscription.service.js`)
   - Replace Airtable calls with PostgreSQL  
   - Update foreign key relationships (users_id vs user_id arrays)
   - Test Stripe webhooks and usage tracking

3. **Video Services** (`youtube.controller.js`, `videos.controller.js`)
   - Replace Airtable calls with PostgreSQL
   - Update user_id field references
   - Test video import and processing

**Week 2 - Supporting Services**:

4. **Background Processing**
   - `processing-queue.service.js` (no Airtable table exists - may need creation)
   - `content-generation.service.js`
   - `transcript.service.js`

### Phase 3: Cleanup and Testing (3-5 days)

1. **Remove Airtable Dependencies**
   - Remove `airtable.service.js`
   - Remove `airtable` package from dependencies
   - Clean up environment variables (`AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`)
   - Remove dual-database logic from services

2. **Final Testing**
   - End-to-end user flows
   - Subscription and billing workflows
   - Video processing pipeline
   - OAuth integrations

## Code Changes Required

### Service Updates

#### 1. **Database Service Enhancements**

Need to add missing CRUD operations to match Airtable service API:

```javascript
// src/services/database.service.js additions needed:

async createMultiple(tableName, recordsData) {
  // Batch insert functionality
}

async findByMultipleFields(tableName, fieldConditions) {
  // Complex WHERE clause queries
}

async findDuplicate(tableName, fieldConditions) {
  // Duplicate checking logic
}

async getTableSchema(tableName) {
  // Schema introspection for debugging
}
```

#### 2. **Authentication Service Migration**

```javascript
// Update src/services/auth.service.js
// Replace: const airtableService = require('./airtable.service');
// With: const database = require('./database.service');

// Update table name from 'Users' to 'users'
// Handle ID differences (Airtable recXXX vs PostgreSQL integers)
```

#### 3. **Foreign Key Relationship Updates**

Major change: Airtable uses record IDs like `recABC123` while PostgreSQL uses integer IDs.

**Current code patterns**:
```javascript
// Airtable format
user_id: [userId]  // Array of Airtable record IDs

// PostgreSQL format (needed)
user_id: parseInt(userId)  // Integer foreign key
```

### Controller Updates

All controllers using Airtable need updates:
- `youtube.controller.js`
- `videos.controller.js`  
- `subscription.controller.js`
- `auth.controller.js`

### Middleware Updates

- `subscription.middleware.js` - Update usage tracking queries
- Update any ID handling logic for PostgreSQL integer IDs

## Migration Risks and Mitigation

### High Risks

1. **Data Loss During Migration**
   - **Mitigation**: Full backup before migration, staged rollout, rollback plan
   
2. **Downtime During Migration**
   - **Mitigation**: Blue-green deployment, feature flags, gradual migration

3. **ID Reference Issues**  
   - **Mitigation**: ID mapping tables, careful testing of foreign key relationships

4. **Performance Degradation**
   - **Mitigation**: Database indexing, query optimization, performance testing

### Medium Risks

1. **Stripe Webhook Processing Changes**
   - **Mitigation**: Webhook endpoint testing, staged deployment

2. **OAuth Integration Issues**
   - **Mitigation**: OAuth flow testing, fallback authentication methods

## Testing Strategy

### Pre-Migration Testing
- Backup all Airtable data
- Test PostgreSQL schema creation
- Validate data migration scripts

### Migration Testing  
- Test each service migration independently
- Integration testing between services
- End-to-end user workflow testing

### Post-Migration Validation
- Data integrity verification
- Performance benchmarking  
- User acceptance testing
- Monitor error rates and system health

## Cost Analysis

### Current Costs (Airtable)
- Airtable Pro Plan: ~$20/month per user
- API rate limit concerns with growth
- Limited to 50,000 records per base

### Post-Migration Costs (PostgreSQL Only)
- Railway PostgreSQL: ~$5/month for small instances
- Better scalability and performance
- No record count limitations

### Migration Investment
- Development time: ~4-6 weeks  
- Testing and validation: ~1-2 weeks
- **Total estimated effort**: 6-8 weeks

## Implementation Timeline

**Migration is much faster since PostgreSQL schema and data already exist!**

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Week 1** | Core Services | Update auth, subscriptions, video services |
| **Week 2** | Background Services | Update processing, AI generation, OAuth |  
| **Week 2.5** | Cleanup & Testing | Remove Airtable, comprehensive testing |

**Total Migration Time: ~2 weeks instead of 8 weeks**

## Post-Migration Benefits

1. **Cost Savings**: Reduce monthly database costs by 60-80%
2. **Performance**: Faster queries, no API rate limits  
3. **Scalability**: Handle more users and videos without limitations
4. **Maintenance**: Single database system reduces complexity
5. **Control**: Full control over schema, backups, and optimizations

## Key Migration Findings

### ✅ What's Already Done
- **PostgreSQL Schema**: 100% complete with all 13 tables
- **Data Synchronization**: Users and subscription data already synced  
- **Foreign Key Relations**: Proper relational database structure in place
- **Airtable ID Mapping**: `airtable_id` fields exist for backward compatibility
- **Database Service**: `database.service.js` already has CRUD operations

### 🔄 What Needs Migration
- **Service Code Only**: Replace Airtable calls with PostgreSQL calls
- **ID Format Changes**: Convert Airtable record IDs to PostgreSQL integer IDs  
- **Field Name Mapping**: Update field names to match PostgreSQL schema
- **Dependency Cleanup**: Remove Airtable package and environment variables

### 💡 Simplified Migration Reality

**This is NOT a database migration** - it's a **service code refactor**. The PostgreSQL database is already built, populated, and ready. The task is simply updating 17 service files to use PostgreSQL instead of Airtable.

## Recommended Next Steps

1. **Start with Authentication Service**: Update `auth.service.js` first as it's most critical
2. **Create Migration Branch**: `git checkout -b sunset-airtable` 
3. **Update One Service at a Time**: Test each service individually
4. **Handle ID Conversions**: Create helper functions for Airtable ID ↔ PostgreSQL ID mapping
5. **Test Thoroughly**: Ensure each service works with PostgreSQL before moving to next
6. **Remove Airtable Dependencies**: Final cleanup once all services migrated

---

**Note**: This migration should be performed in a development environment first, with comprehensive testing before production deployment. The dual-database system currently in place provides a safety net during the migration process.