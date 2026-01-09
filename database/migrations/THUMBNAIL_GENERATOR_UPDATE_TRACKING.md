# Thumbnail Generator Service Update Tracking

**Created:** 2026-01-07
**Last Updated:** 2026-01-07
**Purpose:** Track progress on fixing thumbnail generation issues
**Status:** COMPLETED (Phase 2 - SDK Migration)

---

## Root Cause Analysis

Comparing original React app (`.viraltube/`) with current Node.js implementation revealed these differences:

| Aspect | Original React App | Current Node.js | Status |
|--------|-------------------|-----------------|--------|
| Model | `gemini-2.5-flash-image` | Configurable via env | FIXED |
| SDK | `@google/genai` | `@google/genai` (UPDATED!) | FIXED |
| Image Config | Has `imageConfig: { aspectRatio }` | Now has imageConfig | FIXED |
| Character Anchor | Detailed physical description | Now has DEFAULT_CHARACTER_ANCHOR | FIXED |
| Anti-text instructions | Not present | Added comprehensive rules | FIXED |

---

## CRITICAL FIX: SDK Migration (Phase 2)

### Problem Identified
After reviewing the sample images (v1-v4 from our app vs v5-v8 from original), we discovered the issue was NOT just the prompt - it was the **SDK and API call structure**:

**Issues with v1-v4 (Our implementation):**
- Different person generated in each image (no character consistency)
- Cyberpunk/AI-looking aesthetic instead of photorealistic
- Garbled/misspelled text
- Missing glasses and other distinguishing features

**v5-v8 (Original app) showed:**
- SAME consistent person across all 4 images
- Professional YouTube thumbnail style
- Correct text rendering (mostly)
- Proper photorealistic appearance

### Solution Applied
1. **Switched SDK** from `@google/generative-ai` to `@google/genai`
2. **Updated API call structure** to use `ai.models.generateContent()` with `imageConfig`
3. **Added DEFAULT_CHARACTER_ANCHOR** constant for consistent character generation

---

## Tasks Checklist

### 1. Environment Variable for Model
- [x] Add `GEMINI_IMAGE_MODEL` to `.env`
- [x] Add `GEMINI_IMAGE_MODEL` to `.env.example`
- [x] Update `thumbnail-generator.service.js` to read from env var

**Files Modified:**
- `.env` (line ~96)
- `.env.example` (line ~96)
- `src/services/thumbnail-generator.service.js` (line 16)

**Environment Variable Added:**
```env
# Gemini Image Generation Model
# Options: gemini-2.0-flash-exp, gemini-2.5-flash-preview-05-20, etc.
GEMINI_IMAGE_MODEL=gemini-2.0-flash-exp
```

---

### 2. Update Prompt with Anti-Text-Hallucination Instructions
- [x] Add explicit instructions to prevent misspelled/random text
- [x] Add instructions to ONLY use provided topic/subtopic text
- [x] Add instruction for photorealistic style (not cyber/AI-looking)

**File Modified:** `src/services/thumbnail-generator.service.js`
**Function:** `buildThumbnailPrompt()` (lines 99-198)

**Instructions Added:**
```
CRITICAL TEXT RULES (MANDATORY - READ CAREFULLY):
- ONLY include text that EXACTLY matches the Main Topic and Sub-Topic provided below
- DO NOT add any additional text, words, labels, watermarks, or captions
- DO NOT invent, modify, abbreviate, or misspell any words
- DO NOT add random letters, symbols, or gibberish text anywhere in the image
- If you cannot render text clearly and correctly, OMIT IT ENTIRELY rather than rendering it incorrectly
- Every word in the image must come directly from the topic/subtopic - no exceptions

REALISM REQUIREMENTS (MANDATORY):
- The person MUST look like a real photograph, NOT digital art, CGI, or illustration
- Use the reference images to match EXACT facial features, skin texture, pores, and natural lighting
- Avoid any "AI-generated", "uncanny valley", "plastic", or "overly smooth" appearance
- Skin should have natural texture, pores, and subtle imperfections
- The final image should be indistinguishable from a professional studio photograph
- NO cyberpunk, neon-outline, or sci-fi aesthetic unless specifically requested in the topic
```

---

### 3. Update generateSingleThumbnail Function
- [x] Update to use `GEMINI_IMAGE_MODEL` constant
- [x] Add logging for model being used

**File Modified:** `src/services/thumbnail-generator.service.js`
**Function:** `generateSingleThumbnail()` (lines 200-257)

---

### 4. Update editThumbnail Function
- [x] Update to use `GEMINI_IMAGE_MODEL` constant
- [x] Add logging for model being used

**File Modified:** `src/services/thumbnail-generator.service.js`
**Function:** `editThumbnail()` (lines 259-310)

---

### 5. Database Migration for Character Anchor Profiles
- [x] Create migration SQL file
- [x] Add `user_character_profiles` table
- [x] Add `character_profile_options` lookup table
- [x] Add auto-generation function for anchor text
- [x] Add triggers for default profile management

**File Created:** `database/migrations/add-character-profiles-table.sql`

**Tables Created:**
- `user_character_profiles` - Stores user physical descriptions
- `character_profile_options` - Dropdown options for profile fields

**TO RUN MIGRATION:**
```sql
-- Connect to your database and run:
\i database/migrations/add-character-profiles-table.sql
```

---

### 6. Update Service for Character Anchor Support
- [x] Add `getCharacterProfiles()` method
- [x] Add `getDefaultCharacterProfile()` method
- [x] Add `getCharacterProfile()` method
- [x] Add `createCharacterProfile()` method
- [x] Add `updateCharacterProfile()` method
- [x] Add `deleteCharacterProfile()` method
- [x] Add `setDefaultCharacterProfile()` method
- [x] Add `getCharacterProfileOptions()` method
- [x] Update `generateThumbnails()` to auto-fetch character anchor

**File Modified:** `src/services/thumbnail-generator.service.js`
**Methods Added:** Lines 726-933

---

### 7. Update Controller for Character Profile Endpoints
- [x] Add `getCharacterProfiles()` endpoint
- [x] Add `getCharacterProfileOptions()` endpoint
- [x] Add `getCharacterProfile()` endpoint
- [x] Add `createCharacterProfile()` endpoint
- [x] Add `updateCharacterProfile()` endpoint
- [x] Add `deleteCharacterProfile()` endpoint
- [x] Add `setDefaultCharacterProfile()` endpoint

**File Modified:** `src/controllers/thumbnail.controller.js`
**Methods Added:** Lines 322-429

---

### 8. Update Routes for Character Profile Endpoints
- [x] Add all character profile routes

**File Modified:** `src/routes/thumbnail.routes.js`
**Routes Added:** Lines 41-48

**New API Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/thumbnails/character-profiles` | Get all user profiles |
| GET | `/api/thumbnails/character-profiles/options` | Get dropdown options |
| GET | `/api/thumbnails/character-profiles/:id` | Get specific profile |
| POST | `/api/thumbnails/character-profiles` | Create new profile |
| PUT | `/api/thumbnails/character-profiles/:id` | Update profile |
| DELETE | `/api/thumbnails/character-profiles/:id` | Delete profile |
| POST | `/api/thumbnails/character-profiles/:id/default` | Set as default |

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `.env` | Added `GEMINI_IMAGE_MODEL` |
| `.env.example` | Added `GEMINI_IMAGE_MODEL` |
| `src/services/thumbnail-generator.service.js` | Model env var, anti-text prompt, character profile methods |
| `src/controllers/thumbnail.controller.js` | Character profile endpoints |
| `src/routes/thumbnail.routes.js` | Character profile routes |
| `database/migrations/add-character-profiles-table.sql` | NEW - Character profile tables |

---

## Deployment Steps

1. **Run the database migration:**
   ```bash
   # Connect to PostgreSQL and run:
   psql -U postgres -d railway -f database/migrations/add-character-profiles-table.sql
   ```

2. **Update environment variables on Railway:**
   - Add `GEMINI_IMAGE_MODEL=gemini-2.0-flash-exp` (or your preferred model)

3. **Deploy the application**

4. **Test the character profile API:**
   ```bash
   # Create a character profile
   curl -X POST https://your-app.com/api/thumbnails/character-profiles \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "profileName": "My Profile",
       "raceEthnicity": "African American",
       "ageRange": "Late 40s to early 50s",
       "gender": "Male",
       "faceShape": "Oval with defined jawline",
       "skinTone": "Warm brown",
       "isDefault": true
     }'
   ```

---

## Progress Log

| Date | Task | Status |
|------|------|--------|
| 2026-01-07 | Created tracking document | Done |
| 2026-01-07 | Added GEMINI_IMAGE_MODEL to .env | Done |
| 2026-01-07 | Added GEMINI_IMAGE_MODEL to .env.example | Done |
| 2026-01-07 | Added GEMINI_IMAGE_MODEL constant to service | Done |
| 2026-01-07 | Updated buildThumbnailPrompt() with anti-text rules | Done |
| 2026-01-07 | Updated buildThumbnailPrompt() with realism requirements | Done |
| 2026-01-07 | Updated generateSingleThumbnail() to use env model | Done |
| 2026-01-07 | Updated editThumbnail() to use env model | Done |
| 2026-01-07 | Created character profile migration | Done |
| 2026-01-07 | Added character profile service methods | Done |
| 2026-01-07 | Updated generateThumbnails() to fetch character anchor | Done |
| 2026-01-07 | Added character profile controller methods | Done |
| 2026-01-07 | Added character profile routes | Done |
| 2026-01-07 | Updated tracking document | Done |
| **2026-01-07** | **PHASE 2: SDK MIGRATION** | **Done** |
| 2026-01-07 | Installed @google/genai SDK | Done |
| 2026-01-07 | Updated service to use new SDK (GoogleGenAI) | Done |
| 2026-01-07 | Updated generateSingleThumbnail() with imageConfig | Done |
| 2026-01-07 | Updated editThumbnail() with new SDK structure | Done |
| 2026-01-07 | Added DEFAULT_CHARACTER_ANCHOR constant | Done |
| 2026-01-07 | Updated .env to use gemini-2.5-flash-preview-05-20 | Done |
| 2026-01-07 | Verified syntax with node -c | Done |

---

## Next Steps (Optional Enhancements)

1. **Frontend UI for Character Profiles:**
   - Add character profile management UI in Thumbnail Studio
   - Allow users to create/edit their physical description

2. **Auto-Generate from Reference Images:**
   - Use AI to analyze reference images and suggest character attributes

3. **Multiple Profiles:**
   - Support multiple character profiles for users with multiple channels/personas
