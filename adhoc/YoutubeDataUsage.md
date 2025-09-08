# YouTube Data Usage - Our AI Legacy Platform

## Overview

Our AI Legacy is a ministry-focused content creation platform that transforms YouTube video content into educational materials using artificial intelligence. This document provides a comprehensive explanation of how we access, process, and utilize YouTube data through the YouTube Data API v3 and OAuth 2.0 integration.

## Application Information

- **Application Name:** Our AI Legacy
- **Operating Company:** Bezaleel Consulting Group
- **Primary Domain:** https://dev.ourailegacy.com
- **Contact Email:** support@ourailegacy.com
- **Jurisdiction:** Illinois, United States

## YouTube Integration Purpose

Our platform serves ministry and educational communities by enabling content creators to:

1. **Import Their Own Video Content:** Users connect their YouTube channels to access their uploaded videos
2. **Generate Educational Materials:** Transform video transcripts into study guides, discussion questions, blog posts, and quizzes
3. **Organize Content Libraries:** Manage and categorize video content for ministry and educational use
4. **Create Accessible Resources:** Convert video content into multiple formats for broader accessibility

## OAuth Scopes Requested

### Primary Scopes

1. **`https://www.googleapis.com/auth/youtube.readonly`**
   - **Purpose:** Read-only access to user's YouTube account data
   - **Usage:** Retrieve channel information, video metadata, playlists, and video lists
   - **Data Accessed:** Channel details, video titles, descriptions, thumbnails, upload dates, durations

2. **`https://www.googleapis.com/auth/youtube.force-ssl`**
   - **Purpose:** Force SSL connections for secure data transmission
   - **Usage:** Ensure all YouTube API communications are encrypted
   - **Security Benefit:** Protects user data during transmission

## Detailed Data Access and Usage

### 1. Channel Information

**Data Retrieved:**
- Channel ID, name, and description
- Channel thumbnails and profile images
- Subscriber count and video count statistics
- Channel creation date and custom URL
- Branding settings and channel metadata

**Purpose:**
- Display channel information in user dashboard
- Associate imported videos with correct channel ownership
- Provide channel statistics for content organization
- Enable channel-specific content management

**Storage Location:**
- PostgreSQL database (`user_youtube_channels` table)
- Encrypted OAuth tokens in (`youtube_oauth_tokens` table)

### 2. Video Metadata

**Data Retrieved:**
- Video ID, title, and description
- Upload date and duration
- Video thumbnails (multiple resolutions)
- Privacy status and category
- View count and engagement statistics
- Video tags and metadata

**Purpose:**
- Import video information for content processing
- Generate AI-based educational materials from video descriptions
- Create organized content libraries
- Provide video analytics for content creators

**Storage Location:**
- Airtable (`Videos` table)
- PostgreSQL database (`videos` table)
- Dual-write architecture for data redundancy

### 3. Playlist Information

**Data Retrieved:**
- Playlist ID, title, and description
- Playlist thumbnails and creation date
- Video count and playlist privacy settings
- Individual video items within playlists
- Playlist organization structure

**Purpose:**
- Import organized video collections
- Maintain playlist structure for content organization
- Enable batch processing of related videos
- Preserve creator's content categorization

### 4. Video Transcripts (Third-Party Integration)

**Data Source:** Custom transcript extraction API
- **Endpoint:** `https://io.ourailegacy.com/api/appify/get-transcript`
- **Method:** Video URL submitted to extract closed captions/transcripts
- **Purpose:** Obtain video transcripts for AI content generation

**Usage:**
- Extract spoken content from videos
- Generate educational materials based on video content
- Create study guides, discussion questions, and summaries
- Enable accessibility through text-based content

## Data Processing Workflow

### 1. User Authentication
```
User → OAuth Consent → Google Authorization → Access Token → Our Platform
```

### 2. Channel Connection
```
OAuth Token → Channel Information → Database Storage → User Dashboard Display
```

### 3. Video Import Process
```
User Selection → Video Metadata Retrieval → Dual Database Write → Transcript Extraction → AI Processing
```

### 4. Content Generation
```
Video Transcript → AI Processing (Gemini/OpenAI) → Educational Content → User Library
```

## Data Storage and Security

### Storage Architecture

**Dual Database System:**
1. **Airtable (Primary):** User interface and content management
2. **PostgreSQL (Secondary):** Advanced features and data redundancy

**Data Categories Stored:**
- OAuth tokens (encrypted with AES-256-CBC)
- Channel information and statistics
- Video metadata and thumbnails
- Generated educational content
- User preferences and settings

### Security Measures

**Token Security:**
- OAuth access and refresh tokens encrypted before storage
- 32-character encryption key with AES-256-CBC algorithm
- Token expiration and automatic refresh handling
- Secure token revocation on user request

**Data Transmission:**
- All API communications over HTTPS/TLS
- Encrypted storage of sensitive information
- Rate limiting and abuse protection
- Secure authentication with JWT tokens

**Access Controls:**
- User-specific data isolation
- Role-based access permissions
- Audit logging for data access
- Regular security monitoring

## User Control and Consent

### Explicit Consent Process
1. **OAuth Authorization:** Users must explicitly authorize YouTube access
2. **Scope Disclosure:** Clear explanation of requested permissions
3. **Data Usage Transparency:** Detailed privacy policy and terms of service
4. **Ongoing Control:** Users can disconnect YouTube access at any time

### User Rights
- **Access:** View all stored YouTube data
- **Modification:** Update preferences and settings
- **Deletion:** Remove YouTube connection and delete associated data
- **Portability:** Export personal data and generated content
- **Revocation:** Disconnect YouTube authorization through Google account

### Data Retention
- **Active Accounts:** Data retained while account is active and YouTube connected
- **Disconnected Accounts:** YouTube data deleted when user disconnects integration
- **Closed Accounts:** All user data deleted within 30 days of account closure
- **Legal Requirements:** Minimum retention only as required by law

## Third-Party Data Sharing

### AI Processing Partners
1. **Google Gemini AI**
   - **Data Shared:** Video transcripts for content generation
   - **Purpose:** Generate educational materials and summaries
   - **Privacy Policy:** https://policies.google.com/privacy

2. **OpenAI (ChatGPT)**
   - **Data Shared:** Video transcripts for content generation
   - **Purpose:** Create study guides and discussion materials
   - **Privacy Policy:** https://openai.com/privacy/

### Infrastructure Partners
1. **Railway (PostgreSQL Hosting)**
   - **Data Shared:** Database storage and hosting
   - **Purpose:** Secure data storage and application hosting

2. **Airtable (Primary Database)**
   - **Data Shared:** User and video information for content management
   - **Purpose:** Primary data storage and user interface

### Payment Processing
1. **Stripe**
   - **Data Shared:** Subscription and billing information only
   - **Purpose:** Process subscription payments
   - **YouTube Data:** No YouTube data shared with payment processor

## Compliance and Legal Framework

### Privacy Regulations
- **GDPR Compliance:** User rights, data portability, and deletion
- **CCPA Compliance:** California consumer privacy protections
- **COPPA Compliance:** No data collection from children under 13

### YouTube API Terms Compliance
- **Terms of Service:** Full compliance with YouTube API Terms of Service
- **Developer Policies:** Adherence to YouTube Developer Policy guidelines
- **Data Usage:** Legitimate educational and ministry use cases only

### Audit and Monitoring
- **Regular Security Audits:** Quarterly security assessment and updates
- **Access Logging:** Comprehensive logging of all data access and modifications
- **Incident Response:** Established procedures for security incidents
- **User Notifications:** Immediate notification of any data breaches

## Data Minimization Practices

### Collection Limitation
- **Necessary Data Only:** Collect only data required for service functionality
- **User-Initiated:** Import only videos explicitly selected by users
- **Scope Limitation:** Request minimal OAuth scopes required for functionality

### Processing Limitation
- **Purpose Limitation:** Use data solely for stated educational content generation
- **User Control:** Users control which videos are processed for AI generation
- **Opt-Out Options:** Users can skip AI processing for specific videos

### Storage Limitation
- **Active Use:** Store data only while actively needed for service provision
- **Regular Cleanup:** Automated deletion of expired tokens and unused data
- **User-Driven Retention:** Data lifecycle tied to user account status

## Quality Assurance and Content Review

### AI-Generated Content Review
- **User Responsibility:** Users must review all AI-generated content before use
- **Accuracy Disclaimer:** Platform disclaims responsibility for AI content accuracy
- **Content Guidelines:** Generated content must align with platform terms of service
- **Ministry Focus:** Special consideration for religious and educational content appropriateness

### Data Quality Measures
- **Validation:** Input validation for all YouTube data imports
- **Error Handling:** Graceful handling of API errors and data inconsistencies
- **Backup Systems:** Regular data backups and disaster recovery procedures
- **Monitoring:** Continuous monitoring of data processing pipelines

## Contact Information and Support

### Primary Contact
**Bezaleel Consulting Group**
- **Platform:** Our AI Legacy
- **Email:** support@ourailegacy.com
- **Location:** Illinois, United States

### Data Protection Inquiries
For questions specifically related to YouTube data usage, privacy concerns, or data protection rights:
- **Subject Line:** "YouTube Data Usage Inquiry"
- **Response Time:** Within 48 hours for privacy-related questions
- **Escalation:** Direct escalation to data protection officer for complex issues

### Technical Support
For technical issues related to YouTube integration:
- **Subject Line:** "YouTube Integration Support"
- **Response Time:** Within 24 hours for technical support
- **Documentation:** Comprehensive help documentation available in user dashboard

## Conclusion

Our AI Legacy platform is designed with user privacy, data security, and transparency as core principles. We access YouTube data solely to provide valuable educational content generation services to ministry and educational communities. Our dual database architecture, comprehensive security measures, and user control options ensure responsible stewardship of user data while delivering powerful AI-driven content creation capabilities.

This document serves as our commitment to transparent data practices and responsible YouTube API usage. We regularly review and update our data handling procedures to maintain the highest standards of user privacy and data protection.

---

**Document Version:** 1.0  
**Last Updated:** September 6, 2025  
**Next Review Date:** March 6, 2026  
**Approved By:** Bezaleel Consulting Group Data Protection Team