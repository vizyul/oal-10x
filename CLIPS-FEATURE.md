# Video Clips Feature

## Overview

The Video Clips feature automatically analyzes video transcripts using Gemini 1.5 Pro AI to identify the most engaging moments for short-form vertical video content (YouTube Shorts, TikTok, Instagram Reels). It then generates YouTube clip URLs with timestamps, downloads the clips using yt-dlp, and converts them to vertical (9:16) format using ffmpeg.

## Features

- **AI-Powered Clip Identification**: Uses Gemini 1.5 Pro to analyze transcripts and identify 5-10 shareable moments
- **YouTube Clip URLs**: Generates YouTube URLs with `?t=` timestamp parameters for instant sharing
- **Automatic Downloads**: Downloads clips using yt-dlp with precise timestamp cutting
- **Vertical Format Conversion**: Converts clips to 9:16 aspect ratio (1080x1920) for social media
- **Relevance Scoring**: AI scores each clip (1-10) for shareability potential
- **Database Storage**: Stores all clip metadata, file paths, and processing status

## Architecture

### Database Schema

**video_clips table**:
- `id` - Primary key
- `video_id` - Foreign key to videos table
- `clip_title` - Attention-grabbing title (max 60 characters)
- `clip_description` - Why this clip is engaging
- `start_time_seconds` - Clip start time
- `end_time_seconds` - Clip end time
- `duration_seconds` - Auto-calculated duration
- `youtube_clip_url` - YouTube URL with ?t= parameter
- `file_path` - Local file path after download/conversion
- `file_size_bytes` - File size
- `vertical_format` - Boolean indicating if converted to vertical
- `status` - pending/processing/completed/failed
- `ai_provider` - AI provider used (gemini, chatgpt, etc.)
- `ai_relevance_score` - AI-assigned relevance score (1-10)
- `processing_error` - Error message if failed
- `created_at`, `updated_at`, `processed_at` - Timestamps

### Services

**clips.service.js** (`src/services/clips.service.js`):
- `generateClipSuggestions()` - Uses Gemini 1.5 Pro to analyze transcript
- `saveClipSuggestions()` - Saves clips to database with YouTube URLs
- `getClipsByVideo()` - Retrieves clips for a video
- `downloadClip()` - Downloads clip using yt-dlp
- `convertToVerticalFormat()` - Converts to 9:16 using ffmpeg
- `processVideoClips()` - Complete workflow: generate → save → download → convert
- `deleteClip()` - Deletes clip and files

### Controllers & Routes

**clips.controller.js** (`src/controllers/clips.controller.js`):
- Handles authentication and ownership verification
- Validates requests
- Calls service methods

**API Endpoints** (all require authentication):

```
POST /api/videos/:videoId/clips/generate
GET  /api/videos/:videoId/clips
GET  /api/clips/:clipId
POST /api/clips/:clipId/download
POST /api/clips/:clipId/convert-vertical
DELETE /api/clips/:clipId
```

### AI Prompts

**Stored in `ai_prompts` table** with content type `clips_text`:
- Optimized for Gemini 1.5 Pro
- Instructs AI to find 15-60 second segments
- Requires self-contained clips suitable for vertical format
- Returns structured JSON with title, description, timestamps, relevance score

## Setup

### 1. Run Database Schema Setup

```bash
node scripts/setup-video-clips-schema.js
```

This creates:
- `video_clips` table with indexes and triggers
- `clips_text` content type in `content_types` table
- Default AI prompt for Gemini 1.5 Pro in `ai_prompts` table

### 2. Install Required Tools

**yt-dlp** (YouTube downloader):
```bash
# Windows (using winget)
winget install yt-dlp

# Or using pip
pip install yt-dlp
```

**ffmpeg** (video converter):
```bash
# Windows (using winget)
winget install FFmpeg

# Or download from https://ffmpeg.org/download.html
```

Verify installations:
```bash
yt-dlp --version
ffmpeg -version
```

### 3. Storage Directory

Clips are stored in `storage/clips/` directory (auto-created on first use).

## Usage

### API Examples

#### 1. Generate Clip Suggestions (No Download)

```bash
POST /api/videos/123/clips/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "provider": "gemini",
  "maxClips": 10,
  "downloadClips": false,
  "convertToVertical": false
}
```

**Response**:
```json
{
  "success": true,
  "message": "Generated 8 clip suggestions",
  "videoId": "123",
  "provider": "gemini",
  "generatedClips": 8,
  "savedClips": 8,
  "clips": [
    {
      "clipId": 1,
      "downloaded": false,
      "converted": false
    },
    ...
  ]
}
```

#### 2. Generate, Download & Convert (Full Workflow)

```bash
POST /api/videos/123/clips/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "provider": "gemini",
  "maxClips": 10,
  "downloadClips": true,
  "convertToVertical": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Generated 8 clip suggestions",
  "videoId": "123",
  "provider": "gemini",
  "generatedClips": 8,
  "savedClips": 8,
  "downloads": {
    "attempted": 8,
    "successful": 7,
    "failed": 1
  },
  "conversions": {
    "attempted": 7,
    "successful": 7,
    "failed": 0
  },
  "clips": [
    {
      "clipId": 1,
      "downloaded": true,
      "converted": true,
      "filePath": "C:\\Apps\\our-ai-legacy-app\\storage\\clips\\videoId_125_Powerful_Insight_vertical.mp4"
    },
    ...
  ]
}
```

#### 3. Get All Clips for a Video

```bash
GET /api/videos/123/clips?minRelevance=7&status=completed
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "videoId": "123",
  "count": 6,
  "clips": [
    {
      "id": 1,
      "video_id": 123,
      "clip_title": "The Most Powerful Insight",
      "clip_description": "This segment contains a breakthrough moment",
      "start_time_seconds": 125.5,
      "end_time_seconds": 165.8,
      "duration_seconds": 40.3,
      "youtube_clip_url": "https://youtube.com/watch?v=xxx?t=125",
      "file_path": "C:\\Apps\\...\\videoId_125_vertical.mp4",
      "file_size_bytes": 5242880,
      "vertical_format": true,
      "status": "completed",
      "ai_provider": "gemini",
      "ai_relevance_score": 9,
      "created_at": "2025-10-14T22:00:00.000Z",
      "processed_at": "2025-10-14T22:05:30.000Z"
    },
    ...
  ]
}
```

#### 4. Download Individual Clip

```bash
POST /api/clips/1/download
Authorization: Bearer <token>
```

#### 5. Convert to Vertical Format

```bash
POST /api/clips/1/convert-vertical
Authorization: Bearer <token>
```

#### 6. Delete Clip

```bash
DELETE /api/clips/1
Authorization: Bearer <token>
```

## How It Works

### Step 1: AI Analysis (Gemini 1.5 Pro)

The AI analyzes the video transcript with timestamps and identifies:
- **Self-contained segments**: Clips that make sense without context
- **Strong hooks**: Moments that grab attention
- **Emotional impact**: Humor, insights, or compelling content
- **Optimal length**: 15-60 seconds for short-form platforms
- **Vertical suitability**: Content that works in 9:16 format

**Example AI Output**:
```json
[
  {
    "title": "The Moment Everything Changed",
    "description": "Powerful insight about personal transformation",
    "start_time": 125.5,
    "end_time": 165.8,
    "relevance_score": 9,
    "hook": "Opens with a thought-provoking question"
  },
  {
    "title": "Surprising Truth About Success",
    "description": "Counter-intuitive advice that challenges common beliefs",
    "start_time": 230.2,
    "end_time": 275.6,
    "relevance_score": 8,
    "hook": "Starts with 'What if everything you know is wrong?'"
  }
]
```

### Step 2: YouTube Clip URLs

For each identified clip, a YouTube URL is generated with the `?t=` parameter:
```
https://youtube.com/watch?v=abc123&t=125
```

This allows instant sharing of the exact moment without downloading.

### Step 3: Download with yt-dlp

If `downloadClips: true`, each clip is downloaded using yt-dlp:

```bash
yt-dlp "https://youtube.com/watch?v=abc123" \
  -f "best[height<=1080]" \
  --download-sections "*125.5-165.8" \
  -o "storage/clips/abc123_125_The_Moment_Everything_Changed.mp4" \
  --force-keyframes-at-cuts
```

**Features**:
- Downloads only the specific time range
- Maximum 1080p quality
- Forces keyframes at cut points for clean starts/ends
- Safe filename generation

### Step 4: Vertical Format Conversion with ffmpeg

If `convertToVertical: true`, clips are converted to 9:16 (1080x1920):

```bash
ffmpeg -i input.mp4 \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -c:a copy \
  output_vertical.mp4 \
  -y
```

**Process**:
1. Scales video to fit 1080x1920 (increases dimensions if needed)
2. Crops to exact 1080x1920 (9:16 aspect ratio)
3. Copies audio stream without re-encoding
4. Overwrites existing files

## Error Handling

The system handles various error scenarios:

- **No transcript**: Returns 400 error requesting transcript generation
- **AI generation failure**: Retries up to 2 times with exponential backoff
- **Invalid JSON from AI**: Logs error and rejects malformed responses
- **Download failures**: Updates clip status to 'failed' with error message
- **Conversion failures**: Keeps original file, marks conversion as failed
- **File not found**: Returns appropriate 404 errors

All errors are logged to `logger` with full context.

## Storage Management

**File Locations**:
- Downloaded clips: `storage/clips/`
- Vertical converted clips: `storage/clips/*_vertical.mp4`

**File Naming**:
```
{videoId}_{startTime}_{safeTitle}.mp4
{videoId}_{startTime}_{safeTitle}_vertical.mp4
```

**Cleanup**:
- When a clip is deleted via API, both database record and file are removed
- When a clip is re-converted, the old file is overwritten

## Integration with Existing System

This feature integrates seamlessly with the existing architecture:

1. **Uses same AI infrastructure** (`ai-chat.service.js`, `ai_prompts` table)
2. **Follows same content type pattern** (stored in `content_types` table)
3. **Uses same authentication** (`authMiddleware`, user ownership validation)
4. **Follows same database patterns** (PostgreSQL, foreign keys, timestamps)
5. **Uses same logging** (`logger` utility)

## Performance Considerations

- **AI Generation**: ~5-10 seconds per video (depends on transcript length)
- **Downloads**: Varies by clip duration and internet speed (~30s for 30-second clip)
- **Conversion**: ~10-20 seconds per clip (depends on video quality/length)

**Recommendations**:
- Process clips asynchronously for large batches
- Consider queuing system for high volume
- Monitor storage disk space

## Future Enhancements

Potential improvements:
- [ ] Background job processing for large batches
- [ ] Progress tracking websocket for real-time updates
- [ ] Thumbnail generation for clips
- [ ] Direct upload to social media platforms
- [ ] A/B testing different clip titles/descriptions
- [ ] Analytics on clip performance
- [ ] Automatic subtitle generation
- [ ] Brand watermark overlay
- [ ] Batch export to ZIP
- [ ] Clip scheduling/publishing calendar

## Troubleshooting

### yt-dlp not found
```
Error: Command failed: yt-dlp
```
**Solution**: Install yt-dlp globally: `pip install yt-dlp` or `winget install yt-dlp`

### ffmpeg not found
```
Error: Command failed: ffmpeg
```
**Solution**: Install ffmpeg and add to PATH

### Slow downloads
**Solution**: Check internet connection, try lower quality settings, or process fewer clips

### AI generates invalid JSON
**Solution**: Check logs for AI response, may need to adjust prompt in `ai_prompts` table

### Permission denied on file write
**Solution**: Check `storage/clips/` directory permissions

## Testing

Test the complete workflow:

```bash
# 1. Ensure you have a video with transcript
# 2. Generate clips
curl -X POST http://localhost:3000/api/videos/123/clips/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "gemini",
    "maxClips": 3,
    "downloadClips": true,
    "convertToVertical": true
  }'

# 3. Check results
curl http://localhost:3000/api/videos/123/clips \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Check the `storage/clips/` directory for downloaded files.

## License

This feature is part of the AmplifyContent.ai application and follows the same license.
