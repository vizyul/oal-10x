# AmplifyContent.ai Database Model

> **Auto-generated from Production Database**
> Last updated: 2026-01-26
> Database: PostgreSQL on Railway

---

## Overview

| Metric | Value |
|--------|-------|
| Total Tables | 37 |
| Total Columns | 702 |
| Foreign Keys | 45 |
| Indexes | 126 |

### Table Summary

| Table | Columns | Rows | Description |
|-------|---------|------|-------------|
| admin_subscription_grants | 11 | 3 |  |
| affiliate_clicks | 18 | 12 |  |
| affiliate_payouts | 15 | 0 |  |
| affiliate_referrals | 17 | 0 |  |
| ai_prompts | 13 | 21 | AI prompt templates for content generation |
| api_keys | 15 | 0 | API keys for programmatic access |
| audit_log | 19 | 0 | System audit trail for important actions |
| character_profile_options | 5 | 24 |  |
| cloud_storage_credentials | 20 | 3 |  |
| cloud_storage_uploads | 22 | 0 |  |
| content_types | 11 | 17 |  |
| email_templates | 15 | 0 |  |
| sessions | 24 | 80 | User session tracking with device and location info |
| subscription_events | 17 | 23 | Stripe webhook events and processing status |
| subscription_plan_features | 38 | 5 |  |
| subscription_plan_migrations | 17 | 0 |  |
| subscription_plan_prices | 19 | 8 |  |
| subscription_plan_version_history | 10 | 0 |  |
| subscription_plans | 17 | 5 | Available subscription tiers and pricing |
| subscription_usage | 21 | 24 | Monthly usage tracking (videos, API calls, storage) |
| thumbnail_content_categories | 6 | 6 |  |
| thumbnail_expressions | 10 | 10 |  |
| thumbnail_generation_jobs | 19 | 3 |  |
| thumbnail_reference_images | 15 | 6 |  |
| thumbnail_styles | 7 | 4 |  |
| thumbnail_tier_limits | 8 | 5 |  |
| thumbnail_usage | 9 | 0 |  |
| user_character_profiles | 18 | 0 |  |
| user_preferences | 22 | 18 | User settings and preferences |
| user_subscriptions | 16 | 24 | Stripe subscription records linked to users |
| user_youtube_channels | 17 | 5 | Connected YouTube channels for users |
| users | 66 | 26 | Core user accounts with authentication and profile data |
| video_clips | 19 | 1 |  |
| video_content | 21 | 79 |  |
| video_thumbnails | 24 | 0 |  |
| videos | 28 | 9 | Imported YouTube videos with metadata and content |
| youtube_oauth_tokens | 21 | 5 | OAuth tokens for YouTube API access |

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORE ENTITIES                                      │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │    users     │
                              │──────────────│
                              │ id (PK)      │
                              │ email        │
                              │ subscription │
                              │ _tier        │
                              └──────┬───────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
┌───────────────┐          ┌─────────────────┐          ┌─────────────────┐
│   sessions    │          │user_subscriptions│          │     videos      │
│───────────────│          │─────────────────│          │─────────────────│
│ id (PK)       │          │ id (PK)         │          │ id (PK)         │
│ users_id (FK) │          │ users_id (FK)   │          │ users_id (FK)   │
│ session_id    │          │ plan_name       │          │ video_title     │
└───────────────┘          │ status          │          │ videoid         │
                           └────────┬────────┘          └─────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │                               │
                    ▼                               ▼
          ┌─────────────────┐             ┌─────────────────┐
          │subscription_usage│             │subscription_    │
          │─────────────────│             │events           │
          │ id (PK)         │             │─────────────────│
          │ user_           │             │ id (PK)         │
          │ subscriptions_id│             │ user_           │
          │ (FK)            │             │ subscriptions_id│
          │ videos_processed│             │ (FK)            │
          └─────────────────┘             └─────────────────┘

```

---

## Tables Detail

### admin_subscription_grants



**Row Count:** 3

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('admin_subscription_gr | PK |  |
| user_id | integer | NO |  | FK → users |  |
| granted_by_id | integer | NO |  | FK → users |  |
| grant_type | character varying(50) | NO |  |  |  |
| tier_override | character varying(20) | YES |  |  |  |
| video_limit_override | integer | YES |  |  |  |
| reason | text | NO |  |  |  |
| expires_at | timestamp without time zone | YES |  |  |  |
| is_active | boolean | YES | true |  |  |
| created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| admin_subscription_grants_granted_by_id_fkey | granted_by_id | users(id) |
| admin_subscription_grants_user_id_fkey | user_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| admin_subscription_grants_pkey | btree (id) |
| idx_admin_subscription_grants_active | btree (user_id, is_active) WHERE (is_active = true) |
| idx_admin_subscription_grants_user_id | btree (user_id) |

#### Check Constraints

| Constraint | Condition |
|------------|-----------|
| admin_subscription_grants_tier_override_check | ((tier_override)::text = ANY ((ARRAY['basic'::character varying, 'premium'::character varying, 'creator'::character varying, 'enterprise'::character varying])::text[])) |
| admin_subscription_grants_grant_type_check | ((grant_type)::text = ANY ((ARRAY['full_access'::character varying, 'video_limit_override'::character varying, 'unlimited_videos'::character varying, 'trial_extension'::character varying])::text[])) |

---

### affiliate_clicks



**Row Count:** 12

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('affiliate_clicks_id_s | PK |  |
| referral_code | character varying(100) | NO |  |  |  |
| refgrow_affiliate_id | character varying(255) | YES |  |  |  |
| ip_address | character varying(45) | YES |  |  |  |
| user_agent | text | YES |  |  |  |
| referrer_url | text | YES |  |  |  |
| landing_page | text | YES |  |  |  |
| utm_source | character varying(255) | YES |  |  |  |
| utm_medium | character varying(255) | YES |  |  |  |
| utm_campaign | character varying(255) | YES |  |  |  |
| utm_term | character varying(255) | YES |  |  |  |
| utm_content | character varying(255) | YES |  |  |  |
| country | character varying(2) | YES |  |  |  |
| device_type | character varying(50) | YES |  |  |  |
| converted | boolean | YES | false |  |  |
| users_id | integer | YES |  | FK → users |  |
| clicked_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |  |  |
| created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| affiliate_clicks_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| affiliate_clicks_pkey | btree (id) |
| idx_affiliate_clicks_clicked_at | btree (clicked_at) |
| idx_affiliate_clicks_converted | btree (converted) |
| idx_affiliate_clicks_referral_code | btree (referral_code) |
| idx_affiliate_clicks_refgrow_affiliate_id | btree (refgrow_affiliate_id) |
| idx_affiliate_clicks_users_id | btree (users_id) |

---

### affiliate_payouts



**Row Count:** 0

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('affiliate_payouts_id_ | PK |  |
| refgrow_affiliate_id | character varying(255) | NO |  |  |  |
| users_id | integer | YES |  | FK → users |  |
| payout_amount | numeric(10,2) | NO |  |  |  |
| payout_method | character varying(50) | YES |  |  |  |
| payout_status | character varying(50) | YES | 'pending'::character varying |  |  |
| payout_date | timestamp without time zone | YES |  |  |  |
| transaction_id | character varying(255) | YES |  |  |  |
| referral_count | integer | YES | 0 |  |  |
| period_start | date | YES |  |  |  |
| period_end | date | YES |  |  |  |
| metadata | jsonb | YES |  |  |  |
| notes | text | YES |  |  |  |
| created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| affiliate_payouts_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| affiliate_payouts_pkey | btree (id) |
| idx_affiliate_payouts_date | btree (payout_date) |
| idx_affiliate_payouts_refgrow_affiliate_id | btree (refgrow_affiliate_id) |
| idx_affiliate_payouts_status | btree (payout_status) |
| idx_affiliate_payouts_users_id | btree (users_id) |

---

### affiliate_referrals



**Row Count:** 0

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('affiliate_referrals_i | PK |  |
| users_id | integer | NO |  | FK → users |  |
| refgrow_affiliate_id | character varying(255) | YES |  |  |  |
| refgrow_referral_id | character varying(255) | YES |  |  |  |
| referral_code | character varying(100) | NO |  |  |  |
| referral_source | character varying(255) | YES |  |  |  |
| commission_amount | numeric(10,2) | YES | 0.00 |  |  |
| commission_rate | numeric(5,2) | YES | 20.00 |  |  |
| commission_status | character varying(50) | YES | 'pending'::character varying |  |  |
| stripe_subscription_id | character varying(255) | YES |  |  |  |
| referred_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |  |  |
| converted_at | timestamp without time zone | YES |  |  |  |
| paid_at | timestamp without time zone | YES |  |  |  |
| metadata | jsonb | YES |  |  |  |
| notes | text | YES |  |  |  |
| created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| affiliate_referrals_users_id_fkey | users_id | users(id) |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| affiliate_referrals_refgrow_referral_id_key | refgrow_referral_id |

#### Indexes

| Index Name | Definition |
|------------|------------|
| affiliate_referrals_pkey | btree (id) |
| affiliate_referrals_refgrow_referral_id_key | btree (refgrow_referral_id) |
| idx_affiliate_referrals_commission_status | btree (commission_status) |
| idx_affiliate_referrals_converted_at | btree (converted_at) |
| idx_affiliate_referrals_referral_code | btree (referral_code) |
| idx_affiliate_referrals_refgrow_affiliate_id | btree (refgrow_affiliate_id) |
| idx_affiliate_referrals_stripe_subscription_id | btree (stripe_subscription_id) |
| idx_affiliate_referrals_users_id | btree (users_id) |

---

### ai_prompts

AI prompt templates for content generation

**Row Count:** 21

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('ai_prompts_id_seq1':: | PK |  |
| name | character varying(100) | NO |  |  |  |
| description | text | YES |  |  |  |
| ai_provider | character varying(20) | NO |  |  |  |
| prompt_text | text | NO |  |  |  |
| system_message | text | YES |  |  |  |
| temperature | numeric(2,1) | YES | 0.7 |  |  |
| max_tokens | integer | YES | 2000 |  |  |
| is_active | boolean | YES | true |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| airtable_id | character varying(20) | YES |  |  |  |
| content_type_id | integer | YES |  | FK → content_types |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| ai_prompts_content_type_id_fkey | content_type_id | content_types(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| ai_prompts_pkey | btree (id) |
| idx_ai_prompts_active | btree (is_active) |
| idx_ai_prompts_provider_type | btree (ai_provider, content_type_id) |

---

### api_keys

API keys for programmatic access

**Row Count:** 0

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('api_keys_id_seq1'::re | PK |  |
| users_id | integer | YES |  | FK → users |  |
| key_id | character varying(255) | NO |  |  |  |
| api_key | character varying(255) | NO |  |  |  |
| name | character varying(255) | YES |  |  |  |
| description | text | YES |  |  |  |
| permissions | ARRAY | YES |  |  |  |
| rate_limit | integer | YES |  |  |  |
| rate_limit_window | character varying(50) | YES |  |  |  |
| is_active | boolean | YES | true |  |  |
| expires_at | timestamp with time zone | YES |  |  |  |
| last_used | timestamp with time zone | YES |  |  |  |
| usage_count | integer | YES | 0 |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| api_keys_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| api_keys_pkey | btree (id) |

---

### audit_log

System audit trail for important actions

**Row Count:** 0

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('audit_log_id_seq1'::r | PK |  |
| users_id | integer | YES |  | FK → users |  |
| event_id | character varying(255) | NO |  |  |  |
| event_type | character varying(100) | YES |  |  |  |
| action | character varying(255) | NO |  |  |  |
| resource | character varying(255) | YES |  |  |  |
| before_data | text | YES |  |  |  |
| after_data | text | YES |  |  |  |
| ip_address | inet | YES |  |  |  |
| user_agent | text | YES |  |  |  |
| session_id | character varying(255) | YES |  |  |  |
| request_id | character varying(255) | YES |  |  |  |
| user_email | character varying(255) | YES |  |  |  |
| status | character varying(50) | YES |  |  |  |
| error_message | text | YES |  |  |  |
| risk_level | character varying(50) | YES |  |  |  |
| metadata | text | YES |  |  |  |
| description | text | YES |  |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| audit_log_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| audit_log_pkey | btree (id) |

---

### character_profile_options



**Row Count:** 24

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('character_profile_opt | PK |  |
| field_name | character varying(50) | NO |  |  |  |
| option_value | character varying(100) | NO |  |  |  |
| display_order | integer | YES | 0 |  |  |
| is_active | boolean | YES | true |  |  |

#### Indexes

| Index Name | Definition |
|------------|------------|
| character_profile_options_pkey | btree (id) |

---

### cloud_storage_credentials



**Row Count:** 3

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('cloud_storage_credent | PK |  |
| users_id | integer | NO |  | FK → users |  |
| provider | character varying(50) | NO |  |  |  |
| encrypted_tokens | text | NO |  |  |  |
| encryption_iv | character varying(64) | NO |  |  |  |
| encryption_algorithm | character varying(20) | NO | 'aes-256-cbc'::character varyi |  |  |
| token_expires_at | timestamp with time zone | YES |  |  |  |
| last_refreshed | timestamp with time zone | YES |  |  |  |
| account_email | character varying(255) | YES |  |  |  |
| account_name | character varying(255) | YES |  |  |  |
| account_id | character varying(255) | YES |  |  |  |
| root_folder_id | character varying(500) | YES |  |  |  |
| root_folder_path | character varying(1000) | YES |  |  |  |
| folder_naming_pattern | character varying(255) | YES | '{content_type}_{video_code}': |  |  |
| is_active | boolean | NO | true |  |  |
| last_used | timestamp with time zone | YES |  |  |  |
| last_error | text | YES |  |  |  |
| error_count | integer | YES | 0 |  |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| cloud_storage_credentials_users_id_fkey | users_id | users(id) |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| unique_user_provider | users_id, provider |

#### Indexes

| Index Name | Definition |
|------------|------------|
| cloud_storage_credentials_pkey | btree (id) |
| idx_cloud_storage_active | btree (is_active) WHERE (is_active = true) |
| idx_cloud_storage_provider | btree (provider) |
| idx_cloud_storage_user | btree (users_id) |
| idx_cloud_storage_user_active | btree (users_id, is_active) WHERE (is_active = true) |
| unique_user_provider | btree (users_id, provider) |

#### Check Constraints

| Constraint | Condition |
|------------|-----------|
| cloud_storage_credentials_provider_check | ((provider)::text = ANY ((ARRAY['google_drive'::character varying, 'onedrive'::character varying, 'dropbox'::character varying])::text[])) |

---

### cloud_storage_uploads



**Row Count:** 0

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('cloud_storage_uploads | PK |  |
| users_id | integer | NO |  | FK → users |  |
| cloud_storage_credentials_id | integer | NO |  | FK → cloud_storage_credentials |  |
| videos_id | integer | YES |  | FK → videos |  |
| video_content_id | integer | YES |  | FK → video_content |  |
| provider | character varying(50) | NO |  |  |  |
| content_type | character varying(100) | NO |  |  |  |
| file_format | character varying(20) | NO |  |  |  |
| file_name | character varying(500) | NO |  |  |  |
| file_size | integer | YES |  |  |  |
| cloud_file_id | character varying(500) | YES |  |  |  |
| cloud_file_url | character varying(2000) | YES |  |  |  |
| cloud_folder_id | character varying(500) | YES |  |  |  |
| cloud_folder_path | character varying(1000) | YES |  |  |  |
| status | character varying(50) | NO | 'pending'::character varying |  |  |
| error_message | text | YES |  |  |  |
| retry_count | integer | YES | 0 |  |  |
| max_retries | integer | YES | 3 |  |  |
| started_at | timestamp with time zone | YES |  |  |  |
| completed_at | timestamp with time zone | YES |  |  |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| cloud_storage_uploads_cloud_storage_credentials_id_fkey | cloud_storage_credentials_id | cloud_storage_credentials(id) |
| cloud_storage_uploads_users_id_fkey | users_id | users(id) |
| cloud_storage_uploads_video_content_id_fkey | video_content_id | video_content(id) |
| cloud_storage_uploads_videos_id_fkey | videos_id | videos(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| cloud_storage_uploads_pkey | btree (id) |
| idx_cloud_uploads_pending | btree (status, retry_count) WHERE (((status)::text = 'pending'::text) OR ((status)::text = 'failed'::text)) |
| idx_cloud_uploads_provider | btree (provider) |
| idx_cloud_uploads_status | btree (status) |
| idx_cloud_uploads_user | btree (users_id) |
| idx_cloud_uploads_video | btree (videos_id) |

#### Check Constraints

| Constraint | Condition |
|------------|-----------|
| cloud_storage_uploads_status_check | ((status)::text = ANY ((ARRAY['pending'::character varying, 'uploading'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])) |
| cloud_storage_uploads_file_format_check | ((file_format)::text = ANY ((ARRAY['docx'::character varying, 'pdf'::character varying, 'txt'::character varying, 'md'::character varying])::text[])) |

---

### content_types



**Row Count:** 17

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('content_types_id_seq' | PK |  |
| key | character varying(50) | NO |  |  |  |
| label | character varying(100) | NO |  |  |  |
| icon | character varying(10) | YES |  |  |  |
| description | text | YES |  |  |  |
| display_order | integer | YES | 0 |  |  |
| requires_ai | boolean | YES | true |  |  |
| has_url_field | boolean | YES | true |  |  |
| is_active | boolean | YES | true |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| content_types_key_key | key |

#### Indexes

| Index Name | Definition |
|------------|------------|
| content_types_key_key | btree (key) |
| content_types_pkey | btree (id) |

---

### email_templates



**Row Count:** 0

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('email_templates_id_se | PK |  |
| template_name | character varying(255) | NO |  |  |  |
| subject | character varying(255) | YES |  |  |  |
| body_html | text | YES |  |  |  |
| body_text | text | YES |  |  |  |
| tags | ARRAY | YES |  |  |  |
| template_type | character varying(50) | YES |  |  |  |
| is_active | boolean | YES | true |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| last_sent | timestamp with time zone | YES |  |  |  |
| send_count | integer | YES | 0 |  |  |
| preview_url | character varying(500) | YES |  |  |  |
| template_data | jsonb | YES |  |  |  |
| airtable_id | character varying(20) | YES |  |  |  |

#### Indexes

| Index Name | Definition |
|------------|------------|
| email_templates_pkey | btree (id) |

---

### sessions

User session tracking with device and location info

**Row Count:** 80

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('sessions_id_seq1'::re | PK |  |
| users_id | integer | YES |  | FK → users |  |
| session_id | character varying(255) | NO |  |  |  |
| session_data | jsonb | YES |  |  |  |
| ip_address | inet | YES |  |  |  |
| user_agent | text | YES |  |  |  |
| is_active | boolean | YES | true |  |  |
| expires_at | timestamp with time zone | YES |  |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| last_accessed | timestamp with time zone | YES |  |  |  |
| device_info | jsonb | YES |  |  |  |
| location_data | jsonb | YES |  |  |  |
| device_type | character varying(20) | YES | 'desktop'::character varying |  |  |
| login_method | character varying(30) | YES | 'email'::character varying |  |  |
| status | character varying(20) | YES | 'active'::character varying |  |  |
| user_email | character varying(255) | YES |  |  |  |
| browser | character varying(50) | YES |  |  |  |
| os | character varying(50) | YES |  |  |  |
| last_activity_at | timestamp with time zone | YES |  |  |  |
| location | character varying(255) | YES |  |  |  |
| timezone | character varying(50) | YES |  |  |  |
| duration | numeric(5,2) | YES |  |  |  |
| ended_at | timestamp with time zone | YES |  |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| sessions_users_id_fkey | users_id | users(id) |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| sessions_session_id_key | session_id |

#### Indexes

| Index Name | Definition |
|------------|------------|
| sessions_pkey | btree (id) |
| sessions_session_id_key | btree (session_id) |

---

### subscription_events

Stripe webhook events and processing status

**Row Count:** 23

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('subscription_events_i | PK |  |
| user_subscriptions_id | integer | YES |  | FK → user_subscriptions |  |
| event_type | character varying(100) | YES |  |  |  |
| event_data | jsonb | YES |  |  |  |
| stripe_event_id | character varying(255) | YES |  |  |  |
| processed | boolean | YES | false |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| processed_at | timestamp with time zone | YES |  |  |  |
| error_message | text | YES |  |  |  |
| retry_count | integer | YES | 0 |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| status | character varying(50) | YES | 'pending'::character varying |  |  |
| webhook_received_at | timestamp with time zone | YES |  |  |  |
| processed_successfully | boolean | YES | false |  |  |
| stripe_subscription_id | character varying(255) | YES |  |  |  |
| user_id | integer | YES |  | FK → users |  |
| affiliate_referral_id | integer | YES |  | FK → affiliate_referrals |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| subscription_events_affiliate_referral_id_fkey | affiliate_referral_id | affiliate_referrals(id) |
| fk_subscription_events_user_id | user_id | users(id) |
| subscription_events_user_subscriptions_id_fkey | user_subscriptions_id | user_subscriptions(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_subscription_events_affiliate_referral_id | btree (affiliate_referral_id) |
| subscription_events_pkey | btree (id) |

---

### subscription_plan_features



**Row Count:** 5

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('subscription_plan_fea | PK |  |
| subscription_plan_id | integer | NO |  | FK → subscription_plans |  |
| video_limit | integer | NO | 0 |  |  |
| storage_limit_gb | integer | YES | 0 |  |  |
| api_access | boolean | NO | false |  |  |
| api_calls_per_month | integer | YES | 0 |  |  |
| api_rate_limit | integer | YES | 60 |  |  |
| analytics_access | boolean | NO | false |  |  |
| advanced_analytics | boolean | NO | false |  |  |
| transcript_access | boolean | NO | true |  |  |
| summary_access | boolean | NO | true |  |  |
| chapters_access | boolean | NO | false |  |  |
| blog_post_access | boolean | NO | false |  |  |
| podcast_script_access | boolean | NO | false |  |  |
| social_posts_access | boolean | NO | false |  |  |
| social_posts_count | integer | YES | 0 |  |  |
| discussion_guide_access | boolean | NO | false |  |  |
| quiz_access | boolean | NO | false |  |  |
| quotes_access | boolean | NO | false |  |  |
| slide_deck_access | boolean | NO | false |  |  |
| ebook_access | boolean | NO | false |  |  |
| linkedin_article_access | boolean | NO | false |  |  |
| newsletter_access | boolean | NO | false |  |  |
| marketing_funnel_access | boolean | NO | false |  |  |
| study_guide_access | boolean | NO | false |  |  |
| social_carousel_access | boolean | NO | false |  |  |
| group_chat_guide_access | boolean | NO | false |  |  |
| youtube_auto_update | boolean | NO | false |  |  |
| youtube_channel_limit | integer | YES | 1 |  |  |
| support_level | character varying(50) | YES | 'email'::character varying |  |  |
| priority_processing | boolean | NO | false |  |  |
| team_members | integer | YES | 1 |  |  |
| shared_workspace | boolean | NO | false |  |  |
| white_label | boolean | NO | false |  |  |
| custom_domain | boolean | NO | false |  |  |
| metadata | jsonb | YES |  |  |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| subscription_plan_features_subscription_plan_id_fkey | subscription_plan_id | subscription_plans(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_plan_features_plan_id | btree (subscription_plan_id) |
| idx_plan_features_unique_plan | btree (subscription_plan_id) |
| subscription_plan_features_pkey | btree (id) |

---

### subscription_plan_migrations



**Row Count:** 0

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('subscription_plan_mig | PK |  |
| users_id | integer | NO |  | FK → users |  |
| user_subscriptions_id | integer | YES |  | FK → user_subscriptions |  |
| from_plan_id | integer | YES |  | FK → subscription_plans |  |
| to_plan_id | integer | NO |  | FK → subscription_plans |  |
| migration_type | character varying(50) | NO |  |  |  |
| migration_reason | character varying(100) | YES |  |  |  |
| effective_date | timestamp with time zone | YES |  |  |  |
| is_prorated | boolean | YES | true |  |  |
| proration_amount | integer | YES |  |  |  |
| stripe_subscription_id | character varying(100) | YES |  |  |  |
| stripe_invoice_id | character varying(100) | YES |  |  |  |
| status | character varying(50) | YES | 'pending'::character varying |  |  |
| completed_at | timestamp with time zone | YES |  |  |  |
| metadata | jsonb | YES |  |  |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| subscription_plan_migrations_from_plan_id_fkey | from_plan_id | subscription_plans(id) |
| subscription_plan_migrations_to_plan_id_fkey | to_plan_id | subscription_plans(id) |
| subscription_plan_migrations_user_subscriptions_id_fkey | user_subscriptions_id | user_subscriptions(id) |
| subscription_plan_migrations_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_plan_migrations_created | btree (created_at DESC) |
| idx_plan_migrations_status | btree (status) |
| idx_plan_migrations_subscription | btree (user_subscriptions_id) |
| idx_plan_migrations_type | btree (migration_type) |
| idx_plan_migrations_user | btree (users_id) |
| subscription_plan_migrations_pkey | btree (id) |

---

### subscription_plan_prices



**Row Count:** 8

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('subscription_plan_pri | PK |  |
| subscription_plan_id | integer | NO |  | FK → subscription_plans |  |
| stripe_price_id | character varying(100) | NO |  |  |  |
| stripe_product_id | character varying(100) | YES |  |  |  |
| currency | character varying(3) | NO | 'usd'::character varying |  |  |
| amount | integer | NO |  |  |  |
| billing_period | character varying(20) | NO |  |  |  |
| billing_interval | integer | NO | 1 |  |  |
| display_price | numeric(10,2) | YES |  |  |  |
| monthly_equivalent | numeric(10,2) | YES |  |  |  |
| original_monthly_total | numeric(10,2) | YES |  |  |  |
| savings_amount | numeric(10,2) | YES |  |  |  |
| trial_period_days | integer | YES | 0 |  |  |
| is_active | boolean | NO | true |  |  |
| is_default | boolean | NO | false |  |  |
| metadata | jsonb | YES |  |  |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |
| archived_at | timestamp with time zone | YES |  |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| subscription_plan_prices_subscription_plan_id_fkey | subscription_plan_id | subscription_plans(id) |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| subscription_plan_prices_stripe_price_id_key | stripe_price_id |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_plan_prices_active | btree (is_active) WHERE (is_active = true) |
| idx_plan_prices_default | btree (subscription_plan_id, is_default) WHERE (is_default = true) |
| idx_plan_prices_plan_id | btree (subscription_plan_id) |
| idx_plan_prices_stripe_price | btree (stripe_price_id) |
| subscription_plan_prices_pkey | btree (id) |
| subscription_plan_prices_stripe_price_id_key | btree (stripe_price_id) |

---

### subscription_plan_version_history



**Row Count:** 0

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('subscription_plan_ver | PK |  |
| subscription_plan_id | integer | NO |  | FK → subscription_plans |  |
| version_number | integer | NO |  |  |  |
| changed_by_user_id | integer | YES |  |  |  |
| change_reason | text | YES |  |  |  |
| plan_snapshot | jsonb | NO |  |  |  |
| features_snapshot | jsonb | YES |  |  |  |
| prices_snapshot | jsonb | YES |  |  |  |
| fields_changed | ARRAY | YES |  |  |  |
| version_date | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| subscription_plan_version_history_subscription_plan_id_fkey | subscription_plan_id | subscription_plans(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_plan_version_date | btree (version_date DESC) |
| idx_plan_version_plan_id | btree (subscription_plan_id) |
| subscription_plan_version_history_pkey | btree (id) |

---

### subscription_plans

Available subscription tiers and pricing

**Row Count:** 5

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('subscription_plans_id | PK |  |
| plan_key | character varying(50) | NO |  |  |  |
| plan_name | character varying(100) | NO |  |  |  |
| plan_slug | character varying(100) | NO |  |  |  |
| is_active | boolean | NO | true |  |  |
| is_visible | boolean | NO | true |  |  |
| is_legacy | boolean | NO | false |  |  |
| sort_order | integer | NO | 0 |  |  |
| description | text | YES |  |  |  |
| features | jsonb | YES |  |  |  |
| video_limit | integer | YES | 0 |  |  |
| api_calls_limit | integer | YES | 0 |  |  |
| storage_limit | integer | YES | 0 |  |  |
| metadata | jsonb | YES |  |  |  |
| created_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | NO | CURRENT_TIMESTAMP |  |  |
| deleted_at | timestamp with time zone | YES |  |  |  |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| subscription_plans_plan_key_key | plan_key |
| subscription_plans_plan_slug_key | plan_slug |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_subscription_plans_active | btree (is_active) WHERE (is_active = true) |
| idx_subscription_plans_visible | btree (is_visible) WHERE (is_visible = true) |
| subscription_plans_pkey | btree (id) |
| subscription_plans_plan_key_key | btree (plan_key) |
| subscription_plans_plan_slug_key | btree (plan_slug) |

---

### subscription_usage

Monthly usage tracking (videos, API calls, storage)

**Row Count:** 24

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('subscription_usage_id | PK |  |
| user_subscriptions_id | integer | YES |  | FK → user_subscriptions |  |
| usage_type | character varying(100) | YES |  |  | monthly billing cycle type |
| usage_count | integer | YES | 0 |  |  |
| usage_limit | integer | YES |  |  | Max videos allowed |
| period_start | timestamp with time zone | YES |  |  |  |
| period_end | timestamp with time zone | YES |  |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| metadata | jsonb | YES |  |  |  |
| reset_date | timestamp with time zone | YES |  |  |  |
| feature_used | character varying(100) | YES |  |  |  |
| ip_address | inet | YES |  |  |  |
| user_agent | text | YES |  |  |  |
| ai_summaries_generated | integer | YES | 0 |  |  |
| analytics_views | integer | YES | 0 |  |  |
| api_calls_made | integer | YES | 0 |  |  |
| storage_used_mb | integer | YES | 0 |  |  |
| subscription_id | character varying(255) | YES |  |  |  |
| user_id | integer | YES |  | FK → users |  |
| videos_processed | integer | YES | 0 |  | Videos imported this period |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| fk_subscription_usage_user_id | user_id | users(id) |
| subscription_usage_user_subscriptions_id_fkey | user_subscriptions_id | user_subscriptions(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| subscription_usage_pkey | btree (id) |

---

### thumbnail_content_categories



**Row Count:** 6

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('thumbnail_content_cat | PK |  |
| key | character varying(50) | NO |  |  |  |
| name | character varying(100) | NO |  |  |  |
| display_order | integer | YES | 0 |  |  |
| is_active | boolean | YES | true |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| thumbnail_content_categories_key_key | key |

#### Indexes

| Index Name | Definition |
|------------|------------|
| thumbnail_content_categories_key_key | btree (key) |
| thumbnail_content_categories_pkey | btree (id) |

---

### thumbnail_expressions



**Row Count:** 10

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('thumbnail_expressions | PK |  |
| key | character varying(50) | NO |  |  |  |
| name | character varying(100) | NO |  |  |  |
| primary_emotion | character varying(100) | NO |  |  |  |
| face_details | text | NO |  |  |  |
| eye_details | text | NO |  |  |  |
| intensity | integer | NO |  |  |  |
| display_order | integer | YES | 0 |  |  |
| is_active | boolean | YES | true |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| thumbnail_expressions_key_key | key |

#### Indexes

| Index Name | Definition |
|------------|------------|
| thumbnail_expressions_key_key | btree (key) |
| thumbnail_expressions_pkey | btree (id) |

#### Check Constraints

| Constraint | Condition |
|------------|-----------|
| thumbnail_expressions_intensity_check | ((intensity >= 1) AND (intensity <= 3)) |

---

### thumbnail_generation_jobs



**Row Count:** 3

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('thumbnail_generation_ | PK |  |
| video_id | integer | NO |  | FK → videos |  |
| users_id | integer | NO |  | FK → users |  |
| topic | character varying(255) | NO |  |  |  |
| sub_topic | character varying(255) | YES |  |  |  |
| expression_category | character varying(50) | NO |  |  |  |
| aspect_ratio | character varying(10) | NO |  |  |  |
| content_category | character varying(50) | YES |  |  |  |
| reference_image_ids | jsonb | NO | '[]'::jsonb |  |  |
| status | character varying(20) | NO | 'pending'::character varying |  |  |
| progress | integer | YES | 0 |  |  |
| current_style | character varying(50) | YES |  |  |  |
| generated_thumbnail_ids | jsonb | YES | '[]'::jsonb |  |  |
| error_message | text | YES |  |  |  |
| retry_count | integer | YES | 0 |  |  |
| started_at | timestamp with time zone | YES |  |  |  |
| completed_at | timestamp with time zone | YES |  |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| thumbnail_generation_jobs_users_id_fkey | users_id | users(id) |
| thumbnail_generation_jobs_video_id_fkey | video_id | videos(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_thumbnail_jobs_status | btree (status) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying])::text[])) |
| idx_thumbnail_jobs_user | btree (users_id) |
| idx_thumbnail_jobs_video | btree (video_id) |
| thumbnail_generation_jobs_pkey | btree (id) |

---

### thumbnail_reference_images



**Row Count:** 6

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('thumbnail_reference_i | PK |  |
| users_id | integer | NO |  | FK → users |  |
| cloudinary_public_id | character varying(255) | NO |  |  |  |
| cloudinary_url | character varying(500) | NO |  |  |  |
| cloudinary_secure_url | character varying(500) | NO |  |  |  |
| original_filename | character varying(255) | YES |  |  |  |
| file_size_bytes | integer | YES |  |  |  |
| width | integer | YES |  |  |  |
| height | integer | YES |  |  |  |
| mime_type | character varying(50) | YES |  |  |  |
| display_name | character varying(100) | YES |  |  |  |
| is_default | boolean | YES | false |  |  |
| usage_count | integer | YES | 0 |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| thumbnail_reference_images_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_reference_images_default | btree (users_id, is_default) WHERE (is_default = true) |
| idx_reference_images_user | btree (users_id) |
| thumbnail_reference_images_pkey | btree (id) |

---

### thumbnail_styles



**Row Count:** 4

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('thumbnail_styles_id_s | PK |  |
| key | character varying(50) | NO |  |  |  |
| name | character varying(100) | NO |  |  |  |
| description | text | NO |  |  |  |
| display_order | integer | YES | 0 |  |  |
| is_active | boolean | YES | true |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| thumbnail_styles_key_key | key |

#### Indexes

| Index Name | Definition |
|------------|------------|
| thumbnail_styles_key_key | btree (key) |
| thumbnail_styles_pkey | btree (id) |

---

### thumbnail_tier_limits



**Row Count:** 5

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('thumbnail_tier_limits | PK |  |
| subscription_tier | character varying(50) | NO |  |  |  |
| iterations_16_9 | integer | NO | 1 |  |  |
| iterations_9_16 | integer | NO | 1 |  |  |
| is_unlimited | boolean | NO | false |  |  |
| reset_monthly | boolean | NO | false |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| thumbnail_tier_limits_subscription_tier_key | subscription_tier |

#### Indexes

| Index Name | Definition |
|------------|------------|
| thumbnail_tier_limits_pkey | btree (id) |
| thumbnail_tier_limits_subscription_tier_key | btree (subscription_tier) |

---

### thumbnail_usage



**Row Count:** 0

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('thumbnail_usage_id_se | PK |  |
| users_id | integer | NO |  | FK → users |  |
| aspect_ratio | character varying(10) | NO | '16:9'::character varying |  |  |
| iterations_used | integer | NO | 0 |  |  |
| thumbnails_generated | integer | NO | 0 |  |  |
| period_start | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| period_end | timestamp with time zone | YES |  |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| thumbnail_usage_users_id_fkey | users_id | users(id) |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| thumbnail_usage_users_id_aspect_ratio_period_start_key | users_id, aspect_ratio, period_start |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_thumbnail_usage_period | btree (users_id, period_start, period_end) |
| idx_thumbnail_usage_user_aspect | btree (users_id, aspect_ratio) |
| thumbnail_usage_pkey | btree (id) |
| thumbnail_usage_users_id_aspect_ratio_period_start_key | btree (users_id, aspect_ratio, period_start) |

---

### user_character_profiles



**Row Count:** 0

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('user_character_profil | PK |  |
| users_id | integer | NO |  | FK → users |  |
| profile_name | character varying(100) | NO | 'Default'::character varying |  |  |
| race_ethnicity | character varying(100) | YES |  |  |  |
| age_range | character varying(50) | YES |  |  |  |
| gender | character varying(50) | YES |  |  |  |
| face_shape | character varying(100) | YES |  |  |  |
| eye_description | text | YES |  |  |  |
| hair_description | text | YES |  |  |  |
| skin_tone | character varying(100) | YES |  |  |  |
| facial_hair | text | YES |  |  |  |
| glasses_description | text | YES |  |  |  |
| distinguishing_features | text | YES |  |  |  |
| full_anchor_text | text | YES |  |  |  |
| is_default | boolean | YES | false |  |  |
| is_active | boolean | YES | true |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| user_character_profiles_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_character_profiles_default | btree (users_id, is_default) WHERE (is_default = true) |
| idx_character_profiles_user | btree (users_id) |
| user_character_profiles_pkey | btree (id) |

---

### user_preferences

User settings and preferences

**Row Count:** 18

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('user_preferences_id_s | PK |  |
| users_id | integer | YES |  | FK → users |  |
| theme | character varying(20) | YES | 'light'::character varying |  |  |
| language | character varying(10) | YES | 'en'::character varying |  |  |
| timezone | character varying(50) | YES |  |  |  |
| email_notifications | boolean | YES | true |  |  |
| push_notifications | boolean | YES | true |  |  |
| marketing_emails | boolean | YES | false |  |  |
| privacy_level | character varying(20) | YES | 'normal'::character varying |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| preferences_data | jsonb | YES |  |  |  |
| airtable_id | character varying(20) | YES |  |  |  |
| marketing_communications | boolean | YES | false |  |  |
| is_active | boolean | YES | true |  |  |
| preference_value | text | YES |  |  |  |
| weekly_digest | boolean | YES | true |  |  |
| llm | character varying(50) | YES | 'gemini'::character varying |  |  |
| cloud_storage_provider | character varying(50) | YES | NULL::character varying |  |  |
| cloud_storage_auto_upload | boolean | YES | false |  |  |
| cloud_storage_upload_format | character varying(20) | YES | 'both'::character varying |  |  |
| cloud_storage_folder_per_video | boolean | YES | true |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| user_preferences_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_user_preferences_users_id | btree (users_id) WITH (fillfactor='100', deduplicate_items='true') |
| user_preferences_pkey | btree (id) |

#### Check Constraints

| Constraint | Condition |
|------------|-----------|
| check_cloud_upload_format | ((cloud_storage_upload_format)::text = ANY ((ARRAY['docx'::character varying, 'pdf'::character varying, 'both'::character varying, 'none'::character varying])::text[])) |

---

### user_subscriptions

Stripe subscription records linked to users

**Row Count:** 24

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('user_subscriptions_id | PK |  |
| users_id | integer | YES |  | FK → users |  |
| stripe_subscription_id | character varying(255) | YES |  |  | Stripe subscription reference |
| plan_name | character varying(100) | YES |  |  | Free/Basic/Premium/Creator/Enterprise |
| status | character varying(50) | YES |  |  | active/canceled/past_due/etc |
| current_period_start | timestamp with time zone | YES |  |  |  |
| current_period_end | timestamp with time zone | YES |  |  |  |
| trial_start | timestamp with time zone | YES |  |  |  |
| trial_end | timestamp with time zone | YES |  |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| metadata | jsonb | YES |  |  |  |
| price_id | character varying(255) | YES |  |  |  |
| airtable_id | character varying(20) | YES |  |  |  |
| cancel_at_period_end | boolean | YES | false |  |  |
| stripe_customer_id | character varying(255) | YES |  |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| user_subscriptions_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| user_subscriptions_pkey | btree (id) |

---

### user_youtube_channels

Connected YouTube channels for users

**Row Count:** 5

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('user_youtube_channels | PK |  |
| users_id | integer | YES |  | FK → users |  |
| channel_id | character varying(255) | YES |  |  |  |
| channel_name | character varying(255) | YES |  |  |  |
| channel_handle | character varying(255) | YES |  |  |  |
| subscriber_count | integer | YES |  |  |  |
| is_active | boolean | YES | true |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| channel_data | jsonb | YES |  |  |  |
| last_sync | timestamp with time zone | YES |  |  |  |
| airtable_id | character varying(20) | YES |  |  |  |
| channel_description | text | YES |  |  |  |
| channel_thumbnail | text | YES |  |  |  |
| is_primary | boolean | YES | false |  |  |
| video_count | integer | YES | 0 |  |  |
| last_synced | timestamp with time zone | YES |  |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| user_youtube_channels_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| user_youtube_channels_pkey | btree (id) |

---

### users

Core user accounts with authentication and profile data

**Row Count:** 26

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('users_id_seq1'::regcl | PK | Primary identifier |
| first_name | character varying(100) | YES |  |  |  |
| last_name | character varying(100) | YES |  |  |  |
| email | character varying(255) | NO |  |  | Unique email address |
| password | character varying(255) | YES |  |  | Bcrypt hashed password |
| email_verified | boolean | YES | false |  | Email verification status |
| email_verification_token | character varying(255) | YES |  |  |  |
| email_verification_expires | timestamp with time zone | YES |  |  |  |
| password_reset_token | character varying(255) | YES |  |  |  |
| password_reset_expires | timestamp with time zone | YES |  |  |  |
| terms_accepted | boolean | YES | false |  |  |
| privacy_accepted | boolean | YES | false |  |  |
| status | character varying(50) | YES | 'active'::character varying |  |  |
| subscription_tier | character varying(50) | YES | 'free'::character varying |  | free/basic/premium/creator/enterprise |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| last_login | timestamp with time zone | YES |  |  |  |
| login_count | integer | YES | 0 |  |  |
| oauth_provider | character varying(50) | YES |  |  |  |
| oauth_id | character varying(255) | YES |  |  |  |
| profile_image_url | text | YES |  |  |  |
| phone | character varying(20) | YES |  |  |  |
| date_of_birth | date | YES |  |  |  |
| gender | character varying(20) | YES |  |  |  |
| location | character varying(100) | YES |  |  |  |
| bio | text | YES |  |  |  |
| website_url | text | YES |  |  |  |
| social_links | jsonb | YES |  |  |  |
| preferences | jsonb | YES |  |  |  |
| metadata | jsonb | YES |  |  |  |
| airtable_id | character varying(20) | YES |  |  |  |
| stripe_customer_id | character varying(255) | YES |  |  | Stripe customer reference |
| subscription_status | character varying(50) | YES |  |  |  |
| subscription_plan | character varying(50) | YES |  |  |  |
| subscription_period_end | timestamp with time zone | YES |  |  |  |
| trial_end | timestamp with time zone | YES |  |  |  |
| usage_count | integer | YES | 0 |  |  |
| monthly_usage_limit | integer | YES |  |  |  |
| is_admin | boolean | YES | false |  |  |
| permissions | ARRAY | YES |  |  |  |
| api_access | boolean | YES | false |  |  |
| api_key_hash | character varying(255) | YES |  |  |  |
| two_factor_enabled | boolean | YES | false |  |  |
| two_factor_secret | character varying(255) | YES |  |  |  |
| backup_codes | ARRAY | YES |  |  |  |
| ip_address | inet | YES |  |  |  |
| user_agent | text | YES |  |  |  |
| session_token | character varying(255) | YES |  |  |  |
| refresh_token | character varying(255) | YES |  |  |  |
| token_expires | timestamp with time zone | YES |  |  |  |
| magic_link_token | character varying(255) | YES |  |  |  |
| magic_link_expires | timestamp with time zone | YES |  |  |  |
| welcome_email_sent | boolean | YES | false |  |  |
| onboarding_completed | boolean | YES | false |  |  |
| newsletter_subscribed | boolean | YES | true |  |  |
| welcome_email_sent_at | timestamp with time zone | YES |  |  |  |
| role | character varying(20) | YES | 'user'::character varying |  |  |
| registration_method | character varying(20) | YES | 'email'::character varying |  | email/google/microsoft/apple |
| free_video_used | boolean | YES | false |  | True if free video credit used |
| refgrow_affiliate_id | character varying(255) | YES |  |  |  |
| affiliate_code | character varying(50) | YES |  |  |  |
| referred_by_code | character varying(100) | YES |  |  |  |
| is_affiliate | boolean | YES | false |  |  |
| affiliate_status | character varying(50) | YES | 'inactive'::character varying |  |  |
| affiliate_joined_at | timestamp without time zone | YES |  |  |  |
| preferred_cloud_storage | character varying(50) | YES | NULL::character varying |  |  |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| users_affiliate_code_key | affiliate_code |
| users_email_key | email |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_users_affiliate_code | btree (affiliate_code) |
| idx_users_is_affiliate | btree (is_affiliate) |
| idx_users_referred_by_code | btree (referred_by_code) |
| idx_users_refgrow_affiliate_id | btree (refgrow_affiliate_id) |
| users_affiliate_code_key | btree (affiliate_code) |
| users_email_key | btree (email) |
| users_pkey | btree (id) |

---

### video_clips



**Row Count:** 1

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('video_clips_id_seq':: | PK |  |
| video_id | integer | NO |  | FK → videos |  |
| clip_title | character varying(255) | NO |  |  |  |
| clip_description | text | YES |  |  |  |
| start_time_seconds | numeric(10,2) | NO |  |  |  |
| end_time_seconds | numeric(10,2) | NO |  |  |  |
| duration_seconds | numeric(10,2) | YES |  |  |  |
| youtube_clip_url | text | YES |  |  |  |
| file_path | text | YES |  |  |  |
| file_size_bytes | bigint | YES |  |  |  |
| vertical_format | boolean | YES | false |  |  |
| thumbnail_path | text | YES |  |  |  |
| status | character varying(50) | YES | 'pending'::character varying |  |  |
| ai_provider | character varying(50) | YES |  |  |  |
| ai_relevance_score | numeric(5,2) | YES |  |  |  |
| processing_error | text | YES |  |  |  |
| created_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp without time zone | YES | CURRENT_TIMESTAMP |  |  |
| processed_at | timestamp without time zone | YES |  |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| video_clips_video_id_fkey | video_id | videos(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_video_clips_created_at | btree (created_at DESC) WITH (fillfactor='100', deduplicate_items='true') |
| idx_video_clips_relevance | btree (ai_relevance_score DESC) WITH (fillfactor='100', deduplicate_items='true') |
| idx_video_clips_status | btree (status) WITH (fillfactor='100', deduplicate_items='true') |
| idx_video_clips_video_id | btree (video_id) WITH (fillfactor='100', deduplicate_items='true') |
| video_clips_pkey | btree (id) |

#### Check Constraints

| Constraint | Condition |
|------------|-----------|
| valid_status | ((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text])) |
| valid_time_range | (end_time_seconds > start_time_seconds) |

---

### video_content



**Row Count:** 79

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('video_content_id_seq' | PK |  |
| video_id | integer | NO |  | FK → videos |  |
| content_type_id | integer | NO |  | FK → content_types |  |
| content_text | text | YES |  |  |  |
| content_url | text | YES |  |  |  |
| ai_provider | character varying(50) | YES |  |  |  |
| prompt_used_id | integer | YES |  | FK → ai_prompts |  |
| generation_status | character varying(20) | YES | 'completed'::character varying |  |  |
| generation_started_at | timestamp with time zone | YES |  |  |  |
| generation_completed_at | timestamp with time zone | YES |  |  |  |
| generation_duration_seconds | integer | YES |  |  |  |
| content_quality_score | numeric(3,2) | YES |  |  |  |
| user_rating | integer | YES |  |  |  |
| is_published | boolean | YES | true |  |  |
| version | integer | YES | 1 |  |  |
| parent_content_id | integer | YES |  | FK → video_content |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| created_by_user_id | integer | YES |  | FK → users |  |
| response_length | integer | YES |  |  |  |
| tokens_used | integer | YES |  |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| video_content_content_type_id_fkey | content_type_id | content_types(id) |
| video_content_created_by_user_id_fkey | created_by_user_id | users(id) |
| video_content_parent_content_id_fkey | parent_content_id | video_content(id) |
| video_content_prompt_used_id_fkey | prompt_used_id | ai_prompts(id) |
| video_content_video_id_fkey | video_id | videos(id) |

#### Unique Constraints

| Constraint | Columns |
|------------|---------|
| video_content_video_id_content_type_id_version_key | video_id, content_type_id, version |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_video_content_content_type_id | btree (content_type_id) |
| idx_video_content_video_id | btree (video_id) |
| idx_video_content_video_type | btree (video_id, content_type_id) |
| video_content_pkey | btree (id) |
| video_content_video_id_content_type_id_version_key | btree (video_id, content_type_id, version) |

---

### video_thumbnails



**Row Count:** 0

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('video_thumbnails_id_s | PK |  |
| video_id | integer | NO |  | FK → videos |  |
| users_id | integer | NO |  | FK → users |  |
| cloudinary_public_id | character varying(255) | NO |  |  |  |
| cloudinary_url | character varying(500) | NO |  |  |  |
| cloudinary_secure_url | character varying(500) | NO |  |  |  |
| topic | character varying(255) | NO |  |  |  |
| sub_topic | character varying(255) | YES |  |  |  |
| expression_category | character varying(50) | NO |  |  |  |
| aspect_ratio | character varying(10) | NO | '16:9'::character varying |  |  |
| style_name | character varying(50) | NO |  |  |  |
| content_category | character varying(50) | YES |  |  |  |
| file_size_bytes | integer | YES |  |  |  |
| width | integer | YES |  |  |  |
| height | integer | YES |  |  |  |
| format | character varying(10) | YES | 'png'::character varying |  |  |
| is_selected | boolean | YES | false |  |  |
| is_uploaded_to_youtube | boolean | YES | false |  |  |
| generation_order | integer | NO |  |  |  |
| version | integer | YES | 1 |  |  |
| refinement_instruction | text | YES |  |  |  |
| parent_thumbnail_id | integer | YES |  | FK → video_thumbnails |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| video_thumbnails_parent_thumbnail_id_fkey | parent_thumbnail_id | video_thumbnails(id) |
| video_thumbnails_users_id_fkey | users_id | users(id) |
| video_thumbnails_video_id_fkey | video_id | videos(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_video_thumbnails_created | btree (video_id, created_at DESC) |
| idx_video_thumbnails_selected | btree (video_id, is_selected) WHERE (is_selected = true) |
| idx_video_thumbnails_users_id | btree (users_id) |
| idx_video_thumbnails_video_id | btree (video_id) |
| video_thumbnails_pkey | btree (id) |

---

### videos

Imported YouTube videos with metadata and content

**Row Count:** 9

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('videos_id_seq1'::regc | PK |  |
| users_id | integer | YES |  | FK → users |  |
| youtube_url | text | YES |  |  |  |
| videoid | character varying(255) | YES |  |  | YouTube video ID |
| video_title | character varying(500) | YES |  |  | Video title from YouTube |
| channel_name | character varying(255) | YES |  |  |  |
| channel_handle | character varying(255) | YES |  |  |  |
| thumbnail | text | YES |  |  |  |
| description | text | YES |  |  |  |
| duration | integer | YES |  |  |  |
| upload_date | timestamp with time zone | YES |  |  |  |
| view_count | bigint | YES |  |  |  |
| like_count | integer | YES |  |  |  |
| comment_count | integer | YES |  |  |  |
| tags | ARRAY | YES |  |  |  |
| category | character varying(100) | YES |  |  |  |
| privacy_setting | character varying(50) | YES |  |  |  |
| status | character varying(50) | YES | 'active'::character varying |  |  |
| transcript_text | text | YES |  |  | Extracted transcript content |
| transcript_url | text | YES |  |  |  |
| processing_status | character varying(50) | YES |  |  |  |
| processed_at | timestamp with time zone | YES |  |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| metadata | jsonb | YES |  |  |  |
| airtable_id | character varying(20) | YES |  |  |  |
| imported_via_youtube_oauth | boolean | YES | false |  |  |
| video_type | character varying(10) | YES | 'video'::character varying |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| videos_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| idx_videos_status | btree (status) |
| idx_videos_users_created | btree (users_id, created_at DESC) |
| idx_videos_users_id | btree (users_id) |
| idx_videos_users_status | btree (users_id, status) |
| idx_videos_video_type | btree (video_type) |
| videos_pkey | btree (id) |

---

### youtube_oauth_tokens

OAuth tokens for YouTube API access

**Row Count:** 5

#### Columns

| Column | Type | Nullable | Default | Key | Description |
|--------|------|----------|---------|-----|-------------|
| id | integer | NO | nextval('youtube_oauth_tokens_ | PK |  |
| users_id | integer | YES |  | FK → users |  |
| access_token | text | YES |  |  |  |
| refresh_token | text | YES |  |  |  |
| expires_at | timestamp with time zone | YES |  |  |  |
| scope | text | YES |  |  |  |
| token_type | character varying(50) | YES |  |  |  |
| created_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| updated_at | timestamp with time zone | YES | CURRENT_TIMESTAMP |  |  |
| is_active | boolean | YES | true |  |  |
| last_used | timestamp with time zone | YES |  |  |  |
| channel_id | character varying(255) | YES |  |  |  |
| encrypted_data | text | YES |  |  |  |
| airtable_id | character varying(20) | YES |  |  |  |
| encrypted_tokens | text | NO |  |  |  |
| encryption_iv | character varying(255) | NO |  |  |  |
| encryption_algorithm | character varying(50) | NO | 'aes-256-cbc'::character varyi |  |  |
| channel_name | character varying(255) | YES |  |  |  |
| channel_thumbnail | text | YES |  |  |  |
| last_refreshed | timestamp with time zone | YES |  |  |  |
| token_expires_at | timestamp with time zone | YES |  |  |  |

#### Foreign Keys

| Constraint | Column | References |
|------------|--------|------------|
| youtube_oauth_tokens_users_id_fkey | users_id | users(id) |

#### Indexes

| Index Name | Definition |
|------------|------------|
| youtube_oauth_tokens_pkey | btree (id) |

---

## Sequences

| Sequence Name | Start | Min | Max | Increment |
|---------------|-------|-----|-----|-----------|
| admin_subscription_grants_id_seq | 1 | 1 | 2147483647 | 1 |
| affiliate_clicks_id_seq | 1 | 1 | 2147483647 | 1 |
| affiliate_payouts_id_seq | 1 | 1 | 2147483647 | 1 |
| affiliate_referrals_id_seq | 1 | 1 | 2147483647 | 1 |
| ai_prompts_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| ai_prompts_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| api_keys_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| api_keys_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| audit_log_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| audit_log_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| character_profile_options_id_seq | 1 | 1 | 2147483647 | 1 |
| cloud_storage_credentials_id_seq | 1 | 1 | 2147483647 | 1 |
| cloud_storage_uploads_id_seq | 1 | 1 | 2147483647 | 1 |
| content_types_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| email_templates_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| email_templates_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| sessions_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| sessions_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| subscription_events_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| subscription_events_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| subscription_plan_features_id_seq | 1 | 1 | 2147483647 | 1 |
| subscription_plan_migrations_id_seq | 1 | 1 | 2147483647 | 1 |
| subscription_plan_prices_id_seq | 1 | 1 | 2147483647 | 1 |
| subscription_plan_version_history_id_seq | 1 | 1 | 2147483647 | 1 |
| subscription_plans_id_seq | 1 | 1 | 2147483647 | 1 |
| subscription_usage_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| subscription_usage_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| thumbnail_content_categories_id_seq | 1 | 1 | 2147483647 | 1 |
| thumbnail_expressions_id_seq | 1 | 1 | 2147483647 | 1 |
| thumbnail_generation_jobs_id_seq | 1 | 1 | 2147483647 | 1 |
| thumbnail_reference_images_id_seq | 1 | 1 | 2147483647 | 1 |
| thumbnail_styles_id_seq | 1 | 1 | 2147483647 | 1 |
| thumbnail_tier_limits_id_seq | 1 | 1 | 2147483647 | 1 |
| thumbnail_usage_id_seq | 1 | 1 | 2147483647 | 1 |
| user_character_profiles_id_seq | 1 | 1 | 2147483647 | 1 |
| user_preferences_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| user_preferences_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| user_subscriptions_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| user_subscriptions_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| user_youtube_channels_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| user_youtube_channels_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| users_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| users_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| video_clips_id_seq | 1 | 1 | 2147483647 | 1 |
| video_content_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| video_thumbnails_id_seq | 1 | 1 | 2147483647 | 1 |
| videos_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| videos_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |
| youtube_oauth_tokens_id_seq | 1 | 1 | 9223372036854775807 | 1 |
| youtube_oauth_tokens_id_seq1 | 1 | 1 | 9223372036854775807 | 1 |

---

## Relationships Summary

### Foreign Key Relationships

| From Table | Column | To Table | Column |
|------------|--------|----------|--------|
| admin_subscription_grants | granted_by_id | users | id |
| admin_subscription_grants | user_id | users | id |
| affiliate_clicks | users_id | users | id |
| affiliate_payouts | users_id | users | id |
| affiliate_referrals | users_id | users | id |
| ai_prompts | content_type_id | content_types | id |
| api_keys | users_id | users | id |
| audit_log | users_id | users | id |
| cloud_storage_credentials | users_id | users | id |
| cloud_storage_uploads | cloud_storage_credentials_id | cloud_storage_credentials | id |
| cloud_storage_uploads | users_id | users | id |
| cloud_storage_uploads | video_content_id | video_content | id |
| cloud_storage_uploads | videos_id | videos | id |
| sessions | users_id | users | id |
| subscription_events | affiliate_referral_id | affiliate_referrals | id |
| subscription_events | user_id | users | id |
| subscription_events | user_subscriptions_id | user_subscriptions | id |
| subscription_plan_features | subscription_plan_id | subscription_plans | id |
| subscription_plan_migrations | from_plan_id | subscription_plans | id |
| subscription_plan_migrations | to_plan_id | subscription_plans | id |
| subscription_plan_migrations | user_subscriptions_id | user_subscriptions | id |
| subscription_plan_migrations | users_id | users | id |
| subscription_plan_prices | subscription_plan_id | subscription_plans | id |
| subscription_plan_version_history | subscription_plan_id | subscription_plans | id |
| subscription_usage | user_id | users | id |
| subscription_usage | user_subscriptions_id | user_subscriptions | id |
| thumbnail_generation_jobs | users_id | users | id |
| thumbnail_generation_jobs | video_id | videos | id |
| thumbnail_reference_images | users_id | users | id |
| thumbnail_usage | users_id | users | id |
| user_character_profiles | users_id | users | id |
| user_preferences | users_id | users | id |
| user_subscriptions | users_id | users | id |
| user_youtube_channels | users_id | users | id |
| video_clips | video_id | videos | id |
| video_content | content_type_id | content_types | id |
| video_content | created_by_user_id | users | id |
| video_content | parent_content_id | video_content | id |
| video_content | prompt_used_id | ai_prompts | id |
| video_content | video_id | videos | id |
| video_thumbnails | parent_thumbnail_id | video_thumbnails | id |
| video_thumbnails | users_id | users | id |
| video_thumbnails | video_id | videos | id |
| videos | users_id | users | id |
| youtube_oauth_tokens | users_id | users | id |

---

## Key Business Logic Notes

### Subscription System

1. **users.subscription_tier** - User's current tier (free, basic, premium, creator, enterprise)
2. **users.free_video_used** - Boolean flag for free tier video limit enforcement
3. **user_subscriptions** - Links users to Stripe subscriptions with plan_name and status
4. **subscription_usage** - Tracks videos_processed, usage_limit per billing period

### Video Import Flow

1. Check admin grants first (admin_grants table)
2. For free users: check `users.free_video_used` flag
3. For paid users: check `subscription_usage.videos_processed` vs limit
4. On successful import: increment counters and set flags

### OAuth Users

- `users.registration_method` stores: 'email', 'google', 'microsoft', 'apple'
- OAuth users get `initializeFreeUserSubscription()` called on first login
- Creates user_subscriptions + subscription_usage records

---

## Maintenance Notes

- This file should be updated when schema changes are made
- Run `node adhoc/document-database-schema.js` to regenerate
- Production database: Railway PostgreSQL
