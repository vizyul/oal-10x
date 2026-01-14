/**
 * Thumbnail Generator Service
 * Ports ViralTube Architect logic to Node.js
 * Uses Gemini for thumbnail generation (model configurable via env)
 *
 * IMPORTANT: Uses @google/genai SDK (not @google/generative-ai) for proper
 * image generation support with imageConfig options.
 */

const { GoogleGenAI } = require('@google/genai');
const database = require('./database.service');
const cloudinaryService = require('./cloudinary.service');
const { logger } = require('../utils');

// Initialize Gemini with new SDK
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

// Get model from environment variable with fallback
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-exp';

// Default character anchor - used when user hasn't created a profile
// This ensures consistent character generation across all thumbnails
const DEFAULT_CHARACTER_ANCHOR = `
CHARACTER ANCHOR ATTRIBUTES (Do not deviate):
- Race: Match exactly from reference images
- Age: Match exactly from reference images
- Face shape: Match exactly from reference images
- Eyes: Match exactly from reference images, including any glasses
- Hair: Match exactly from reference images
- Skin tone: Match exactly from reference images
- Distinguishing features: Match ALL distinguishing features from reference images exactly
- CRITICAL: The generated person MUST be identical to the person in the reference images
`.trim();

// Cache for styles and expressions (loaded from DB)
let stylesCache = null;
let expressionsCache = null;
let categoriesCache = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cacheTimestamp = 0;

/**
 * Load lookup data from database with caching
 */
async function loadLookupData() {
    const now = Date.now();
    if (stylesCache && expressionsCache && categoriesCache && (now - cacheTimestamp < CACHE_TTL)) {
        return { styles: stylesCache, expressions: expressionsCache, categories: categoriesCache };
    }

    const [stylesResult, expressionsResult, categoriesResult] = await Promise.all([
        database.query('SELECT * FROM thumbnail_styles WHERE is_active = TRUE ORDER BY display_order'),
        database.query('SELECT * FROM thumbnail_expressions WHERE is_active = TRUE ORDER BY display_order'),
        database.query('SELECT * FROM thumbnail_content_categories WHERE is_active = TRUE ORDER BY display_order')
    ]);

    stylesCache = stylesResult.rows;
    expressionsCache = expressionsResult.rows;
    categoriesCache = categoriesResult.rows;
    cacheTimestamp = now;

    return { styles: stylesCache, expressions: expressionsCache, categories: categoriesCache };
}

/**
 * Get dynamic background style based on topic keywords
 */
function getBackgroundStyle(topic, category) {
    const t = (topic || '').toLowerCase();
    const cat = (category || '').toLowerCase();

    if (t.includes('money') || t.includes('rich') || t.includes('wealth') || t.includes('broke')) {
        return 'Lush green and vibrant gold color palette. Textures of cash, gold leaf, or high-end architectural gradients.';
    }
    if (t.includes('horror') || t.includes('scary') || t.includes('mystery') || t.includes('ghost')) {
        return 'Deep purple, midnight black, and eerie fog. Cold, desaturated tones with a single piercing accent color like neon green or crimson.';
    }
    if (t.includes('tech') || t.includes('ai') || t.includes('phone') || t.includes('future')) {
        return 'Electric cyan, deep navy, and holographic glass textures. Digital circuit patterns or data-stream bokeh.';
    }
    if (t.includes('nature') || t.includes('ocean') || t.includes('earth') || t.includes('world')) {
        return 'Vibrant forest greens, cerulean blues, and earthy browns. Organic textures and natural lens flares.';
    }
    if (t.includes('exposed') || t.includes('truth') || t.includes('news') || cat.includes('news')) {
        return 'High-alert caution yellow and deep charcoal gray. Industrial textures, newspaper halftone patterns, or glowing orange embers.';
    }
    if (t.includes('break') || t.includes('destroy') || t.includes('rage') || t.includes('war')) {
        return 'High-energy collision background. Shattered glass, volcanic orange fire, and dark obsidian smoke.';
    }

    return 'A custom dynamic color palette derived from the emotional hook of the topic. Avoid repetitive red/blue splits. Use complementary high-contrast colors.';
}

/**
 * Get visual hook element based on topic
 */
function getVisualHook(topic) {
    const t = (topic || '').toLowerCase();

    if (t.includes('break') || t.includes('end') || t.includes('destroy')) {
        return 'A giant heavy sledgehammer smashing through a symbolic object with sparks and debris flying.';
    }
    if (t.includes('expose') || t.includes('truth') || t.includes('secret')) {
        return 'Bright cinematic flares and glowing particles emerging from a dark void, revealing hidden elements.';
    }
    if (t.includes('curse') || t.includes('spirit') || t.includes('dark')) {
        return 'Swirling cosmic energy with split themes of hellish fire (red/orange) and celestial ice (blue/cyan).';
    }
    if (t.includes('money') || t.includes('rich') || t.includes('gold')) {
        return 'Floating golden coins, bars, and luxury textures with high-end bokeh.';
    }

    return 'A high-contrast, glowing symbolic element that represents the central hook of the topic, placed strategically to lead the eye.';
}

/**
 * Build the thumbnail generation prompt
 */
function buildThumbnailPrompt(params) {
    const {
        topic,
        subTopic,
        category,
        expression,
        aspectRatio,
        styleDescription,
        characterAnchor
    } = params;

    const orientation = aspectRatio === '16:9' ? 'landscape (16:9)' : 'portrait (9:16)';

    const compositionAdvice = aspectRatio === '16:9'
        ? 'Subject (Head + Shoulders) occupies 50% of the frame, positioned to one side (Rule of Thirds). TYPOGRAPHY LAYOUT: Place the text on the opposite side of the character or centered.'
        : 'Subject (Head + Shoulders) occupies the middle-to-bottom half of the frame. TYPOGRAPHY LAYOUT: Place the text at the top or center-top area. Ensure vertical balance.';

    const visualHook = getVisualHook(topic);
    const backgroundStyle = getBackgroundStyle(topic, category);

    // Build character anchor section - use user's anchor or the default
    const characterSection = characterAnchor
        ? `CHARACTER ANCHOR ATTRIBUTES (Do not deviate):\n${characterAnchor}`
        : DEFAULT_CHARACTER_ANCHOR;

    // Build content section - only include subtopic if provided
    const hasSubTopic = subTopic && subTopic.trim().length > 0;
    const contentSection = hasSubTopic
        ? `CONTENT:
- Main Topic: "${topic}"
- Sub-Topic: "${subTopic}"`
        : `CONTENT:
- Main Topic: "${topic}"
- Sub-Topic: NONE - DO NOT ADD ANY SUBTITLE TEXT`;

    // Build typography section based on whether subtopic exists
    const typographySection = hasSubTopic
        ? `COMPOSITION & TYPOGRAPHY:
- ${compositionAdvice}
- MAIN TOPIC TEXT: Bold, high-impact 3D typography (Chrome, Gold, or White with thick borders).
- SUB-TOPIC TEXT: High-readability sans-serif text placed directly below the main topic.
- VISUAL SEPARATION: Include a glowing, cinematic horizontal line (divider) between the Main Topic and the Sub-Topic.
- TEXT MUST BE SPELLED CORRECTLY - double-check every letter matches the provided topic exactly.`
        : `COMPOSITION & TYPOGRAPHY:
- ${compositionAdvice}
- MAIN TOPIC TEXT ONLY: Bold, high-impact 3D typography (Chrome, Gold, or White with thick borders).
- NO SUBTITLE: There is no sub-topic, so DO NOT add any subtitle, tagline, quote, or secondary text whatsoever.
- DO NOT INVENT TEXT: Only render the Main Topic text. Nothing else.
- TEXT MUST BE SPELLED CORRECTLY - double-check every letter matches the provided topic exactly.`;

    return `
SYSTEM ROLE: Expert YouTube Thumbnail Designer creating PHOTOREALISTIC thumbnails.
TASK: Generate a high-CTR, viral-style thumbnail in ${orientation} orientation.

CRITICAL TEXT RULES (MANDATORY - READ CAREFULLY):
- ONLY include text that EXACTLY matches the Main Topic${hasSubTopic ? ' and Sub-Topic' : ''} provided below
- DO NOT add any additional text, words, labels, watermarks, or captions
- DO NOT invent, modify, abbreviate, or misspell any words
- DO NOT add random letters, symbols, or gibberish text anywhere in the image
- If you cannot render text clearly and correctly, OMIT IT ENTIRELY rather than rendering it incorrectly
${hasSubTopic ? '- Every word in the image must come directly from the topic/subtopic - no exceptions' : '- The ONLY text allowed is the Main Topic - absolutely NO other text'}

REALISM REQUIREMENTS (MANDATORY):
- The person MUST look like a real photograph, NOT digital art, CGI, or illustration
- Use the reference images to match EXACT facial features, skin texture, pores, and natural lighting
- Avoid any "AI-generated", "uncanny valley", "plastic", or "overly smooth" appearance
- Skin should have natural texture, pores, and subtle imperfections
- The final image should be indistinguishable from a professional studio photograph
- NO cyberpunk, neon-outline, or sci-fi aesthetic unless specifically requested in the topic

${contentSection}

CHARACTER CONSISTENCY (MANDATORY):
Use the likeness from the provided reference images.
${characterSection}

EXPRESSION MAPPING:
Expression Type: ${expression.name}
Primary: ${expression.primary_emotion}
Face Details: ${expression.face_details}
Eyes: ${expression.eye_details}
Intensity: Level ${expression.intensity} (YouTube "Face" style - expressive but natural).

${typographySection}

VISUAL HOOK: ${visualHook}

STYLE VARIATION: ${styleDescription}

BACKGROUND STYLE:
- ${backgroundStyle}
- Use cinematic depth, energetic particles, sparks, or relevant environmental bokeh.
- Ensure the background colors complement the character's clothing and lighting.
- Background should enhance realism, not detract from it.

LIGHTING:
- Dramatic 3/4 lighting on face. Strong rim light (matching the background's primary accent color) to separate the person from the background.
- EYES: Enhanced catchlights (sparkle) and intense focus.
- Lighting should look natural and photographic, not artificial or rendered.

VIRAL STYLE MODIFIERS:
- Professional photography with cinematic color grading.
- Hyper-saturated colors (+25% boost) while maintaining skin tone accuracy.
- Extremely high contrast.
- Aspect Ratio: ${aspectRatio}.
- CRISP focus on the face and text, soft bokeh on background elements.
- The person should look like they were photographed in a professional studio.

FINAL CHECKLIST:
1. Does the person look photorealistic (not AI-generated)?
2. Is the Main Topic text spelled exactly as provided?
${hasSubTopic ? '3. Is the Sub-Topic text spelled exactly as provided?' : '3. Is there ANY subtitle or secondary text? (If yes, REMOVE IT - only Main Topic allowed)'}
4. Is there any extra text that wasn't provided? (If yes, remove it)
5. Does the person match the reference images?
`.trim();
}

/**
 * Generate a single thumbnail using Gemini
 * Uses @google/genai SDK with imageConfig for proper image generation
 */
async function generateSingleThumbnail(prompt, referenceImages, aspectRatio, retries = 3) {
    logger.info(`Using Gemini model: ${GEMINI_IMAGE_MODEL} for thumbnail generation with aspectRatio: ${aspectRatio}`);

    // Build image parts from reference images
    const imageParts = referenceImages.map(img => ({
        inlineData: {
            data: img.data.startsWith('data:') ? img.data.split(',')[1] : img.data,
            mimeType: img.mimeType || 'image/png'
        }
    }));

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Use the new SDK structure with imageConfig
            const response = await ai.models.generateContent({
                model: GEMINI_IMAGE_MODEL,
                contents: {
                    parts: [
                        ...imageParts,
                        { text: prompt }
                    ]
                },
                config: {
                    responseModalities: ['Text', 'Image'],
                    imageConfig: {
                        aspectRatio: aspectRatio
                    }
                }
            });

            // Extract image from response
            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData) {
                        return `data:image/png;base64,${part.inlineData.data}`;
                    }
                }
            }

            throw new Error('No image data in response');
        } catch (error) {
            const isTransient = error.message?.includes('500') ||
                               error.message?.includes('503') ||
                               error.message?.includes('UNKNOWN') ||
                               error.message?.includes('overloaded') ||
                               error.message?.includes('Rpc failed');

            if (attempt < retries && isTransient) {
                const delay = Math.pow(2, attempt) * 1000;
                logger.warn(`Thumbnail generation attempt ${attempt} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                logger.error(`Thumbnail generation failed after ${attempt} attempts:`, error);
                throw error;
            }
        }
    }
}

/**
 * Edit/refine an existing thumbnail
 * Uses @google/genai SDK with imageConfig for proper image editing
 */
async function editThumbnail(baseImageData, instruction, retries = 3) {
    logger.info(`Using Gemini model: ${GEMINI_IMAGE_MODEL} for thumbnail editing`);

    const editPrompt = `Edit this thumbnail. INSTRUCTION: ${instruction}.
Maintain the current aspect ratio and consistent character likeness.
Boost saturation and contrast where necessary to make it look 'viral'.
Keep the typographic layout and horizontal separation if applicable.
Adjust the background dynamically if requested.
IMPORTANT: Keep the person looking photorealistic, not AI-generated.`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Use the new SDK structure
            const response = await ai.models.generateContent({
                model: GEMINI_IMAGE_MODEL,
                contents: {
                    parts: [
                        {
                            inlineData: {
                                data: baseImageData.startsWith('data:')
                                    ? baseImageData.split(',')[1]
                                    : baseImageData,
                                mimeType: 'image/png'
                            }
                        },
                        { text: editPrompt }
                    ]
                },
                config: {
                    responseModalities: ['Text', 'Image']
                }
            });

            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData) {
                        return `data:image/png;base64,${part.inlineData.data}`;
                    }
                }
            }

            throw new Error('No image data in edit response');
        } catch (error) {
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            } else {
                throw error;
            }
        }
    }
}

/**
 * Fetch image from URL and convert to base64
 */
async function fetchImageAsBase64(url) {
    const response = await globalThis.fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
}

class ThumbnailGeneratorService {
    /**
     * Get available styles, expressions, and categories
     */
    async getOptions() {
        return loadLookupData();
    }

    /**
     * Generate all 4 thumbnail variations for a video
     */
    async generateThumbnails(params) {
        const {
            userId,
            videoId,
            topic,
            subTopic,
            expressionKey,
            aspectRatio = '16:9',
            categoryKey,
            referenceImageIds,
            characterAnchor,
            jobId
        } = params;

        const { styles, expressions } = await loadLookupData();

        // Find the selected expression
        const expression = expressions.find(e => e.key === expressionKey);
        if (!expression) {
            throw new Error(`Invalid expression key: ${expressionKey}`);
        }

        // Load reference images from database
        const refImagesResult = await database.query(
            `SELECT cloudinary_secure_url, mime_type FROM thumbnail_reference_images
             WHERE id = ANY($1) AND users_id = $2`,
            [referenceImageIds, userId]
        );

        if (refImagesResult.rows.length === 0) {
            throw new Error('No reference images found. Please upload at least one reference image.');
        }

        // Fetch the actual image data from Cloudinary URLs
        logger.info(`Fetching ${refImagesResult.rows.length} reference images...`);
        const referenceImages = await Promise.all(
            refImagesResult.rows.map(async (img) => {
                const base64 = await fetchImageAsBase64(img.cloudinary_secure_url);
                return {
                    data: base64,
                    mimeType: img.mime_type || 'image/png'
                };
            })
        );

        // Get character anchor - use provided one or fetch user's default profile
        let effectiveCharacterAnchor = characterAnchor;
        if (!effectiveCharacterAnchor) {
            const defaultProfile = await this.getDefaultCharacterProfile(userId);
            if (defaultProfile && defaultProfile.full_anchor_text) {
                effectiveCharacterAnchor = defaultProfile.full_anchor_text;
                logger.info(`Using default character profile for user ${userId}: ${defaultProfile.profile_name}`);
            }
        }

        const results = [];
        const errors = [];

        // Update job status to processing
        if (jobId) {
            await database.query(
                `UPDATE thumbnail_generation_jobs
                 SET status = 'processing', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [jobId]
            );
        }

        // Generate 4 variations (one for each style)
        for (let i = 0; i < styles.length; i++) {
            const style = styles[i];

            // Update job progress if jobId provided
            if (jobId) {
                await database.query(
                    `UPDATE thumbnail_generation_jobs
                     SET progress = $1, current_style = $2, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $3`,
                    [Math.round((i / styles.length) * 100), style.key, jobId]
                );
            }

            try {
                const prompt = buildThumbnailPrompt({
                    topic,
                    subTopic,
                    category: categoryKey,
                    expression,
                    aspectRatio,
                    styleDescription: style.description,
                    characterAnchor: effectiveCharacterAnchor
                });

                logger.info(`Generating thumbnail ${i + 1}/4 (${style.name}) for video ${videoId}`);

                const imageData = await generateSingleThumbnail(prompt, referenceImages, aspectRatio);

                // Generate meaningful public ID: thumb_v{videoId}_{style}_{timestamp}
                const timestamp = Date.now();
                const publicId = `thumb_v${videoId}_${style.key}_${timestamp}`;

                // Upload to Cloudinary (pass aspectRatio for per-ratio limit enforcement)
                const uploadResult = await cloudinaryService.uploadThumbnail(
                    imageData,
                    { userId, videoId, publicId, aspectRatio },
                    database
                );

                // Save to database
                const insertResult = await database.query(
                    `INSERT INTO video_thumbnails (
                        video_id, users_id, cloudinary_public_id, cloudinary_url,
                        cloudinary_secure_url, topic, sub_topic, expression_category,
                        aspect_ratio, style_name, content_category, file_size_bytes,
                        width, height, format, generation_order, is_selected
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                    RETURNING *`,
                    [
                        videoId, userId, uploadResult.publicId, uploadResult.url,
                        uploadResult.secureUrl, topic, subTopic, expressionKey,
                        aspectRatio, style.key, categoryKey, uploadResult.bytes,
                        uploadResult.width, uploadResult.height, uploadResult.format,
                        i + 1, i === 0  // First one is selected by default
                    ]
                );

                results.push({
                    ...insertResult.rows[0],
                    styleName: style.name
                });

                // Update job with new thumbnail ID immediately (for incremental display)
                if (jobId) {
                    const thumbnailIds = results.map(r => r.id);
                    const progress = Math.round(((i + 1) / styles.length) * 100);
                    logger.info(`Updating job ${jobId} with ${thumbnailIds.length} thumbnails, progress: ${progress}%`);

                    await database.query(
                        `UPDATE thumbnail_generation_jobs
                         SET generated_thumbnail_ids = $1::jsonb,
                             progress = $2,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = $3`,
                        [
                            JSON.stringify(thumbnailIds),
                            progress,
                            jobId
                        ]
                    );
                }

                logger.info(`Thumbnail ${i + 1}/4 generated and saved: ${uploadResult.publicId}`);

            } catch (error) {
                logger.error(`Failed to generate thumbnail style ${style.name}:`, error);
                errors.push({ style: style.name, error: error.message });
            }
        }

        // Update job status
        if (jobId) {
            const finalStatus = errors.length === styles.length ? 'failed' : 'completed';
            logger.info(`Job ${jobId} ${finalStatus} with ${results.length} thumbnails`);
            await database.query(
                `UPDATE thumbnail_generation_jobs
                 SET status = $1, progress = 100,
                     generated_thumbnail_ids = $2::jsonb,
                     completed_at = CURRENT_TIMESTAMP,
                     error_message = $3,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4`,
                [
                    finalStatus,
                    JSON.stringify(results.map(r => r.id)),
                    errors.length > 0 ? JSON.stringify(errors) : null,
                    jobId
                ]
            );

            // Track usage for successful generations (at least one thumbnail created)
            if (finalStatus === 'completed' && results.length > 0) {
                await this.trackThumbnailUsage(userId, aspectRatio, results.length);
            }
        }

        return { thumbnails: results, errors };
    }

    /**
     * Regenerate thumbnails with new parameters
     */
    async regenerateThumbnails(params) {
        // Same as generateThumbnails - the 4-limit is enforced by Cloudinary service
        return this.generateThumbnails(params);
    }

    /**
     * Edit/refine a specific thumbnail
     */
    async refineThumbnail(params) {
        const { thumbnailId, userId, instruction } = params;

        // Ensure thumbnailId is an integer
        const thumbId = parseInt(thumbnailId, 10);
        if (isNaN(thumbId)) {
            throw new Error('Invalid thumbnail ID');
        }

        logger.info(`Refining thumbnail ID ${thumbId} for user ${userId}`);

        // Get the original thumbnail
        const thumbResult = await database.query(
            `SELECT * FROM video_thumbnails WHERE id = $1 AND users_id = $2`,
            [thumbId, userId]
        );

        if (thumbResult.rows.length === 0) {
            throw new Error(`Thumbnail ${thumbId} not found or does not belong to user`);
        }

        const original = thumbResult.rows[0];

        // Verify the ID matches what we queried
        if (original.id !== thumbId) {
            logger.error(`ID mismatch! Database returned ID ${original.id} but we queried for ${thumbId}`);
            throw new Error('Thumbnail ID mismatch');
        }

        logger.info(`Refining thumbnail ${thumbId} with instruction: ${instruction}`);

        // Fetch the original image
        const base64 = await fetchImageAsBase64(original.cloudinary_secure_url);

        // Edit with Gemini
        const editedImageData = await editThumbnail(base64, instruction);

        // Generate meaningful public ID: thumb_v{videoId}_{style}_refined_v{version}_{timestamp}
        const newVersion = (original.version || 0) + 1;
        const timestamp = Date.now();
        const publicId = `thumb_v${original.video_id}_${original.style_name}_refined_v${newVersion}_${timestamp}`;

        // Upload edited version (pass aspectRatio from original for per-ratio limit enforcement)
        const uploadResult = await cloudinaryService.uploadThumbnail(
            editedImageData,
            { userId, videoId: original.video_id, publicId, aspectRatio: original.aspect_ratio },
            database
        );

        // Save as new thumbnail with reference to parent
        // Use original.id to ensure we have the correct database ID
        const insertResult = await database.query(
            `INSERT INTO video_thumbnails (
                video_id, users_id, cloudinary_public_id, cloudinary_url,
                cloudinary_secure_url, topic, sub_topic, expression_category,
                aspect_ratio, style_name, content_category, file_size_bytes,
                width, height, format, generation_order, version,
                refinement_instruction, parent_thumbnail_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING *`,
            [
                original.video_id, userId, uploadResult.publicId, uploadResult.url,
                uploadResult.secureUrl, original.topic, original.sub_topic,
                original.expression_category, original.aspect_ratio, original.style_name,
                original.content_category, uploadResult.bytes, uploadResult.width,
                uploadResult.height, uploadResult.format, original.generation_order,
                (original.version || 0) + 1, instruction, original.id
            ]
        );

        logger.info(`Thumbnail refined successfully: ${uploadResult.publicId}`);

        return insertResult.rows[0];
    }

    /**
     * Select a thumbnail as the active one for a video
     */
    async selectThumbnail(thumbnailId, userId) {
        // Get the thumbnail to find the video
        const thumbResult = await database.query(
            `SELECT video_id FROM video_thumbnails WHERE id = $1 AND users_id = $2`,
            [thumbnailId, userId]
        );

        if (thumbResult.rows.length === 0) {
            throw new Error('Thumbnail not found');
        }

        const videoId = thumbResult.rows[0].video_id;

        // Deselect all thumbnails for this video
        await database.query(
            `UPDATE video_thumbnails SET is_selected = FALSE, updated_at = CURRENT_TIMESTAMP WHERE video_id = $1`,
            [videoId]
        );

        // Select the specified thumbnail
        await database.query(
            `UPDATE video_thumbnails SET is_selected = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [thumbnailId]
        );

        logger.info(`Thumbnail ${thumbnailId} selected for video ${videoId}`);

        return { success: true, videoId, thumbnailId };
    }

    /**
     * Get all thumbnails for a video
     */
    async getVideoThumbnails(videoId, userId) {
        const result = await database.query(
            `SELECT t.*, s.name as style_display_name
             FROM video_thumbnails t
             LEFT JOIN thumbnail_styles s ON t.style_name = s.key
             WHERE t.video_id = $1 AND t.users_id = $2
             ORDER BY t.created_at DESC`,
            [videoId, userId]
        );
        return result.rows;
    }

    /**
     * Delete a specific thumbnail
     */
    async deleteThumbnail(thumbnailId, userId) {
        const thumbResult = await database.query(
            `SELECT cloudinary_public_id, is_selected, video_id
             FROM video_thumbnails WHERE id = $1 AND users_id = $2`,
            [thumbnailId, userId]
        );

        if (thumbResult.rows.length === 0) {
            throw new Error('Thumbnail not found');
        }

        const thumb = thumbResult.rows[0];

        // Delete from Cloudinary
        await cloudinaryService.deleteImage(thumb.cloudinary_public_id);

        // Delete from database
        await database.query('DELETE FROM video_thumbnails WHERE id = $1', [thumbnailId]);

        logger.info(`Thumbnail ${thumbnailId} deleted`);

        // If this was the selected thumbnail, select another one
        if (thumb.is_selected) {
            await database.query(
                `UPDATE video_thumbnails
                 SET is_selected = TRUE, updated_at = CURRENT_TIMESTAMP
                 WHERE video_id = $1 AND id = (
                     SELECT id FROM video_thumbnails
                     WHERE video_id = $1
                     ORDER BY created_at DESC
                     LIMIT 1
                 )`,
                [thumb.video_id]
            );
        }

        return { success: true };
    }

    /**
     * Get user's reference images
     */
    async getReferenceImages(userId) {
        const result = await database.query(
            `SELECT * FROM thumbnail_reference_images
             WHERE users_id = $1
             ORDER BY is_default DESC, created_at DESC`,
            [userId]
        );
        return result.rows;
    }

    /**
     * Upload a reference image
     */
    async uploadReferenceImage(userId, imageData, options = {}) {
        const { displayName, mimeType = 'image/png' } = options;

        // Generate meaningful public ID: ref_{sanitizedName}_{timestamp}
        const timestamp = Date.now();
        const sanitizedName = (displayName || 'image')
            .replace(/\.[^/.]+$/, '')  // Remove file extension
            .replace(/[^a-zA-Z0-9]/g, '_')  // Replace special chars with underscore
            .substring(0, 30);  // Limit length
        const publicId = `ref_${sanitizedName}_${timestamp}`;

        // Upload to Cloudinary
        const uploadResult = await cloudinaryService.uploadReferenceImage(imageData, { userId, publicId });

        // Save to database
        const result = await database.query(
            `INSERT INTO thumbnail_reference_images (
                users_id, cloudinary_public_id, cloudinary_url, cloudinary_secure_url,
                file_size_bytes, width, height, mime_type, display_name
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [
                userId, uploadResult.publicId, uploadResult.url, uploadResult.secureUrl,
                uploadResult.bytes, uploadResult.width, uploadResult.height,
                mimeType, displayName
            ]
        );

        logger.info(`Reference image uploaded for user ${userId}: ${uploadResult.publicId}`);

        return result.rows[0];
    }

    /**
     * Delete a reference image
     */
    async deleteReferenceImage(referenceImageId, userId) {
        const result = await database.query(
            `SELECT cloudinary_public_id FROM thumbnail_reference_images
             WHERE id = $1 AND users_id = $2`,
            [referenceImageId, userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Reference image not found');
        }

        // Delete from Cloudinary
        await cloudinaryService.deleteImage(result.rows[0].cloudinary_public_id);

        // Delete from database
        await database.query('DELETE FROM thumbnail_reference_images WHERE id = $1', [referenceImageId]);

        logger.info(`Reference image ${referenceImageId} deleted`);

        return { success: true };
    }

    /**
     * Set a reference image as default
     */
    async setDefaultReferenceImage(referenceImageId, userId) {
        // Unset all defaults for this user
        await database.query(
            `UPDATE thumbnail_reference_images SET is_default = FALSE WHERE users_id = $1`,
            [userId]
        );

        // Set the new default
        await database.query(
            `UPDATE thumbnail_reference_images SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND users_id = $2`,
            [referenceImageId, userId]
        );

        return { success: true };
    }

    // ==========================================
    // Character Profile Methods
    // ==========================================

    /**
     * Get user's character profiles
     */
    async getCharacterProfiles(userId) {
        const result = await database.query(
            `SELECT * FROM user_character_profiles
             WHERE users_id = $1 AND is_active = TRUE
             ORDER BY is_default DESC, created_at DESC`,
            [userId]
        );
        return result.rows;
    }

    /**
     * Get user's default character profile
     */
    async getDefaultCharacterProfile(userId) {
        const result = await database.query(
            `SELECT * FROM user_character_profiles
             WHERE users_id = $1 AND is_default = TRUE AND is_active = TRUE
             LIMIT 1`,
            [userId]
        );
        return result.rows[0] || null;
    }

    /**
     * Get a specific character profile
     */
    async getCharacterProfile(profileId, userId) {
        const result = await database.query(
            `SELECT * FROM user_character_profiles
             WHERE id = $1 AND users_id = $2`,
            [profileId, userId]
        );
        return result.rows[0] || null;
    }

    /**
     * Create a new character profile
     */
    async createCharacterProfile(userId, profileData) {
        const {
            profileName = 'Default',
            raceEthnicity,
            ageRange,
            gender,
            faceShape,
            eyeDescription,
            hairDescription,
            skinTone,
            facialHair,
            glassesDescription,
            distinguishingFeatures,
            fullAnchorText,
            isDefault = false
        } = profileData;

        const result = await database.query(
            `INSERT INTO user_character_profiles (
                users_id, profile_name, race_ethnicity, age_range, gender,
                face_shape, eye_description, hair_description, skin_tone,
                facial_hair, glasses_description, distinguishing_features,
                full_anchor_text, is_default
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *`,
            [
                userId, profileName, raceEthnicity, ageRange, gender,
                faceShape, eyeDescription, hairDescription, skinTone,
                facialHair, glassesDescription, distinguishingFeatures,
                fullAnchorText, isDefault
            ]
        );

        logger.info(`Character profile created for user ${userId}: ${result.rows[0].id}`);

        return result.rows[0];
    }

    /**
     * Update a character profile
     */
    async updateCharacterProfile(profileId, userId, profileData) {
        const {
            profileName,
            raceEthnicity,
            ageRange,
            gender,
            faceShape,
            eyeDescription,
            hairDescription,
            skinTone,
            facialHair,
            glassesDescription,
            distinguishingFeatures,
            fullAnchorText,
            isDefault
        } = profileData;

        const result = await database.query(
            `UPDATE user_character_profiles SET
                profile_name = COALESCE($3, profile_name),
                race_ethnicity = COALESCE($4, race_ethnicity),
                age_range = COALESCE($5, age_range),
                gender = COALESCE($6, gender),
                face_shape = COALESCE($7, face_shape),
                eye_description = COALESCE($8, eye_description),
                hair_description = COALESCE($9, hair_description),
                skin_tone = COALESCE($10, skin_tone),
                facial_hair = COALESCE($11, facial_hair),
                glasses_description = COALESCE($12, glasses_description),
                distinguishing_features = COALESCE($13, distinguishing_features),
                full_anchor_text = COALESCE($14, full_anchor_text),
                is_default = COALESCE($15, is_default),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND users_id = $2
             RETURNING *`,
            [
                profileId, userId, profileName, raceEthnicity, ageRange, gender,
                faceShape, eyeDescription, hairDescription, skinTone,
                facialHair, glassesDescription, distinguishingFeatures,
                fullAnchorText, isDefault
            ]
        );

        if (result.rows.length === 0) {
            throw new Error('Character profile not found');
        }

        logger.info(`Character profile ${profileId} updated for user ${userId}`);

        return result.rows[0];
    }

    /**
     * Delete a character profile
     */
    async deleteCharacterProfile(profileId, userId) {
        const result = await database.query(
            `DELETE FROM user_character_profiles
             WHERE id = $1 AND users_id = $2
             RETURNING id`,
            [profileId, userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Character profile not found');
        }

        logger.info(`Character profile ${profileId} deleted for user ${userId}`);

        return { success: true };
    }

    /**
     * Set a character profile as default
     */
    async setDefaultCharacterProfile(profileId, userId) {
        // Unset all defaults for this user
        await database.query(
            `UPDATE user_character_profiles SET is_default = FALSE WHERE users_id = $1`,
            [userId]
        );

        // Set the new default
        const result = await database.query(
            `UPDATE user_character_profiles
             SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND users_id = $2
             RETURNING *`,
            [profileId, userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Character profile not found');
        }

        logger.info(`Character profile ${profileId} set as default for user ${userId}`);

        return result.rows[0];
    }

    /**
     * Get character profile options (for dropdowns)
     */
    async getCharacterProfileOptions() {
        const result = await database.query(
            `SELECT field_name, option_value, display_order
             FROM character_profile_options
             WHERE is_active = TRUE
             ORDER BY field_name, display_order`
        );

        // Group by field name
        const options = {};
        for (const row of result.rows) {
            if (!options[row.field_name]) {
                options[row.field_name] = [];
            }
            options[row.field_name].push(row.option_value);
        }

        return options;
    }

    // ==========================================
    // Thumbnail Usage Tracking Methods
    // ==========================================

    /**
     * Check if user can generate thumbnails based on subscription tier limits
     * @param {number} userId - User ID
     * @param {string} aspectRatio - '16:9' or '9:16'
     * @returns {Promise<{canGenerate: boolean, reason?: string, usage?: object, limit?: object}>}
     */
    async checkThumbnailLimit(userId, aspectRatio = '16:9') {
        try {
            // Get user's subscription tier
            const userResult = await database.query(
                'SELECT subscription_tier FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return { canGenerate: false, reason: 'User not found' };
            }

            let subscriptionTier = userResult.rows[0].subscription_tier || 'free';

            // Check for active admin grants that might override the tier
            const grantResult = await database.query(`
                SELECT grant_type, tier_override, video_limit_override
                FROM admin_subscription_grants
                WHERE user_id = $1
                  AND is_active = TRUE
                  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                ORDER BY created_at DESC
                LIMIT 1
            `, [userId]);

            if (grantResult.rows.length > 0) {
                const grant = grantResult.rows[0];

                // Any active grant gives 10 iterations per aspect ratio
                const GRANT_ITERATIONS_LIMIT = 10;

                // Get current usage for this user/aspect ratio (monthly reset for grants)
                const usage = await this.getThumbnailUsage(userId, aspectRatio, true);

                if (usage.iterations_used >= GRANT_ITERATIONS_LIMIT) {
                    return {
                        canGenerate: false,
                        reason: `You've reached your grant limit of ${GRANT_ITERATIONS_LIMIT} ${aspectRatio} thumbnail generations this month. Contact support for more.`,
                        requiresUpgrade: false,
                        hasGrant: true,
                        grantType: grant.grant_type,
                        usage,
                        limit: { iterations: GRANT_ITERATIONS_LIMIT, reset_monthly: true }
                    };
                }

                return {
                    canGenerate: true,
                    reason: `Admin grant: ${usage.iterations_used}/${GRANT_ITERATIONS_LIMIT} iterations used`,
                    hasGrant: true,
                    grantType: grant.grant_type,
                    usage,
                    limit: { iterations: GRANT_ITERATIONS_LIMIT, reset_monthly: true },
                    remaining: GRANT_ITERATIONS_LIMIT - usage.iterations_used
                };
            }

            // Get tier limits
            const limitsResult = await database.query(
                'SELECT * FROM thumbnail_tier_limits WHERE subscription_tier = $1',
                [subscriptionTier]
            );

            if (limitsResult.rows.length === 0) {
                // Default to free tier limits if not found
                logger.warn(`No thumbnail limits found for tier ${subscriptionTier}, using free defaults`);
                return { canGenerate: false, reason: 'Subscription tier limits not configured' };
            }

            const limits = limitsResult.rows[0];

            // If unlimited, always allow
            if (limits.is_unlimited) {
                return {
                    canGenerate: true,
                    reason: 'Unlimited thumbnail generation',
                    limit: limits
                };
            }

            // Get max iterations for this aspect ratio
            const maxIterations = aspectRatio === '9:16'
                ? limits.iterations_9_16
                : limits.iterations_16_9;

            // Get current usage for this user/aspect ratio
            const usage = await this.getThumbnailUsage(userId, aspectRatio, limits.reset_monthly);

            if (usage.iterations_used >= maxIterations) {
                const tierName = subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1);
                return {
                    canGenerate: false,
                    reason: `You've reached your ${tierName} plan limit of ${maxIterations} ${aspectRatio} thumbnail generation${maxIterations === 1 ? '' : 's'}. Upgrade your subscription for more.`,
                    requiresUpgrade: true,
                    usage,
                    limit: limits
                };
            }

            return {
                canGenerate: true,
                reason: `${usage.iterations_used}/${maxIterations} iterations used`,
                usage,
                limit: limits,
                remaining: maxIterations - usage.iterations_used
            };

        } catch (error) {
            logger.error('Error checking thumbnail limit:', { error: error.message });
            // Fail open - allow generation if check fails
            return { canGenerate: true, reason: 'Limit check error - allowing generation' };
        }
    }

    /**
     * Get thumbnail usage for a user and aspect ratio
     * @param {number} userId - User ID
     * @param {string} aspectRatio - '16:9' or '9:16'
     * @param {boolean} resetMonthly - Whether to filter by current month
     * @returns {Promise<{iterations_used: number, thumbnails_generated: number}>}
     */
    async getThumbnailUsage(userId, aspectRatio, resetMonthly = false) {
        try {
            let query, params;

            if (resetMonthly) {
                // Get usage for current billing period (current month)
                const startOfMonth = new Date();
                startOfMonth.setDate(1);
                startOfMonth.setHours(0, 0, 0, 0);

                query = `
                    SELECT COALESCE(SUM(iterations_used), 0) as iterations_used,
                           COALESCE(SUM(thumbnails_generated), 0) as thumbnails_generated
                    FROM thumbnail_usage
                    WHERE users_id = $1
                      AND aspect_ratio = $2
                      AND period_start >= $3
                `;
                params = [userId, aspectRatio, startOfMonth.toISOString()];
            } else {
                // Get lifetime usage (for free tier)
                query = `
                    SELECT COALESCE(SUM(iterations_used), 0) as iterations_used,
                           COALESCE(SUM(thumbnails_generated), 0) as thumbnails_generated
                    FROM thumbnail_usage
                    WHERE users_id = $1 AND aspect_ratio = $2
                `;
                params = [userId, aspectRatio];
            }

            const result = await database.query(query, params);

            return {
                iterations_used: parseInt(result.rows[0].iterations_used) || 0,
                thumbnails_generated: parseInt(result.rows[0].thumbnails_generated) || 0
            };

        } catch (error) {
            logger.error('Error getting thumbnail usage:', { error: error.message });
            return { iterations_used: 0, thumbnails_generated: 0 };
        }
    }

    /**
     * Track thumbnail generation usage after successful generation
     * @param {number} userId - User ID
     * @param {string} aspectRatio - '16:9' or '9:16'
     * @param {number} thumbnailCount - Number of thumbnails generated (usually 4)
     */
    async trackThumbnailUsage(userId, aspectRatio, thumbnailCount = 4) {
        try {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const endOfMonth = new Date(startOfMonth);
            endOfMonth.setMonth(endOfMonth.getMonth() + 1);

            // Upsert usage record
            await database.query(`
                INSERT INTO thumbnail_usage (users_id, aspect_ratio, iterations_used, thumbnails_generated, period_start, period_end)
                VALUES ($1, $2, 1, $3, $4, $5)
                ON CONFLICT (users_id, aspect_ratio, period_start)
                DO UPDATE SET
                    iterations_used = thumbnail_usage.iterations_used + 1,
                    thumbnails_generated = thumbnail_usage.thumbnails_generated + $3,
                    updated_at = CURRENT_TIMESTAMP
            `, [userId, aspectRatio, thumbnailCount, startOfMonth.toISOString(), endOfMonth.toISOString()]);

            logger.info(`Tracked thumbnail usage for user ${userId}: +1 ${aspectRatio} iteration, +${thumbnailCount} thumbnails`);

        } catch (error) {
            logger.error('Error tracking thumbnail usage:', { error: error.message });
            // Don't throw - usage tracking failure shouldn't block generation
        }
    }

    /**
     * Get thumbnail usage summary for a user (both aspect ratios)
     * @param {number} userId - User ID
     * @returns {Promise<object>} Usage summary with limits
     */
    async getThumbnailUsageSummary(userId) {
        try {
            // Get user's subscription tier
            const userResult = await database.query(
                'SELECT subscription_tier FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length === 0) {
                return null;
            }

            let subscriptionTier = userResult.rows[0].subscription_tier || 'free';
            let hasGrant = false;
            let grantType = null;

            // Check for active admin grants that might override the tier
            const grantResult = await database.query(`
                SELECT grant_type, tier_override, video_limit_override
                FROM admin_subscription_grants
                WHERE user_id = $1
                  AND is_active = TRUE
                  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                ORDER BY created_at DESC
                LIMIT 1
            `, [userId]);

            if (grantResult.rows.length > 0) {
                const grant = grantResult.rows[0];
                hasGrant = true;
                grantType = grant.grant_type;

                // Any active grant gives 10 iterations per aspect ratio (monthly reset)
                const GRANT_ITERATIONS_LIMIT = 10;

                const [usage16_9, usage9_16] = await Promise.all([
                    this.getThumbnailUsage(userId, '16:9', true),  // Monthly reset for grants
                    this.getThumbnailUsage(userId, '9:16', true)
                ]);

                return {
                    subscriptionTier: userResult.rows[0].subscription_tier || 'free',
                    effectiveTier: 'grant',
                    hasGrant: true,
                    grantType: grant.grant_type,
                    isUnlimited: false,
                    resetMonthly: true,
                    '16:9': {
                        used: usage16_9.iterations_used,
                        limit: GRANT_ITERATIONS_LIMIT,
                        remaining: Math.max(0, GRANT_ITERATIONS_LIMIT - usage16_9.iterations_used),
                        thumbnailsGenerated: usage16_9.thumbnails_generated
                    },
                    '9:16': {
                        used: usage9_16.iterations_used,
                        limit: GRANT_ITERATIONS_LIMIT,
                        remaining: Math.max(0, GRANT_ITERATIONS_LIMIT - usage9_16.iterations_used),
                        thumbnailsGenerated: usage9_16.thumbnails_generated
                    }
                };
            }

            // Get tier limits
            const limitsResult = await database.query(
                'SELECT * FROM thumbnail_tier_limits WHERE subscription_tier = $1',
                [subscriptionTier]
            );

            const limits = limitsResult.rows[0] || {
                iterations_16_9: 1,
                iterations_9_16: 1,
                is_unlimited: false,
                reset_monthly: false
            };

            // Get usage for both aspect ratios
            const [usage16_9, usage9_16] = await Promise.all([
                this.getThumbnailUsage(userId, '16:9', limits.reset_monthly),
                this.getThumbnailUsage(userId, '9:16', limits.reset_monthly)
            ]);

            return {
                subscriptionTier,
                effectiveTier: subscriptionTier,
                hasGrant,
                grantType,
                isUnlimited: limits.is_unlimited,
                resetMonthly: limits.reset_monthly,
                '16:9': {
                    used: usage16_9.iterations_used,
                    limit: limits.is_unlimited ? 'Unlimited' : limits.iterations_16_9,
                    remaining: limits.is_unlimited ? 'Unlimited' : Math.max(0, limits.iterations_16_9 - usage16_9.iterations_used),
                    thumbnailsGenerated: usage16_9.thumbnails_generated
                },
                '9:16': {
                    used: usage9_16.iterations_used,
                    limit: limits.is_unlimited ? 'Unlimited' : limits.iterations_9_16,
                    remaining: limits.is_unlimited ? 'Unlimited' : Math.max(0, limits.iterations_9_16 - usage9_16.iterations_used),
                    thumbnailsGenerated: usage9_16.thumbnails_generated
                }
            };

        } catch (error) {
            logger.error('Error getting thumbnail usage summary:', { error: error.message });
            return null;
        }
    }
}

module.exports = new ThumbnailGeneratorService();
