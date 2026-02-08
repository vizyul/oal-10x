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
// Note: Must use a model that supports image generation with aspectRatio
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';

// Default character anchor - used when user hasn't created a profile
// Focuses on FACIAL LIKENESS only - pose, expression, and clothing should vary
const DEFAULT_CHARACTER_ANCHOR = `
FACIAL FEATURES TO MATCH (these make it the same person):
- Race/ethnicity: Match from reference
- Age appearance: Match from reference
- Face shape and bone structure: Match from reference
- Eye shape, color, spacing: Match from reference
- Nose shape and size: Match from reference
- Mouth and lip shape: Match from reference
- Skin tone and complexion: Match from reference
- Hair (if any) or bald head: Match from reference
- Any permanent distinguishing features (moles, scars, etc.): Match from reference

DO NOT COPY FROM REFERENCE:
- Pose (follow variation instructions instead)
- Facial expression (follow variation instructions instead)
- Clothing/outfit (create new attire for each thumbnail)
- Accessories (add or remove as needed for the thumbnail)
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
 * Now lets AI decide colors based on topic - no hardcoded color schemes
 */
function getBackgroundStyle(topic, category) {
    return `
Analyze the topic "${topic}" and category "${category || 'general'}" to create the PERFECT background:

1. CHOOSE COLORS that emotionally match the topic's tone and message
2. AVOID defaulting to green - only use green if the topic specifically requires it
3. Consider the psychological impact: warm colors for urgency/passion, cool colors for trust/calm, dark for mystery/drama
4. Create HIGH CONTRAST between background and foreground elements
5. Use complementary or split-complementary color schemes for visual impact
6. Add depth with gradients, textures, or environmental elements that fit the topic

The background should enhance the topic's emotional impact while ensuring the person and text remain the focal point.
`.trim();
}

/**
 * Get visual hook element based on topic
 * Returns topic-specific suggestions or instructs to focus on person/typography if no clear visual fits
 */
function getVisualHook(topic) {
    const t = (topic || '').toLowerCase();

    // Religious/spiritual topics
    if (t.includes('prayer') || t.includes('religion') || t.includes('church') || t.includes('faith') || t.includes('god') || t.includes('jesus') || t.includes('bible')) {
        return 'Religious imagery that fits the topic tone: crosses, churches, stained glass, prayer hands, religious texts, candles. If the topic is critical/negative, show crumbling, abandoned, or decaying religious symbols.';
    }
    // Money/wealth topics
    if (t.includes('money') || t.includes('rich') || t.includes('wealth') || t.includes('broke') || t.includes('debt') || t.includes('financial')) {
        return 'Money-related imagery: cash, coins, gold bars, piggy banks, wallets, bank vaults. Match the tone - luxury for wealth topics, empty wallets for debt topics.';
    }
    // Tech/AI topics
    if (t.includes('ai') || t.includes('tech') || t.includes('app') || t.includes('software') || t.includes('computer') || t.includes('digital')) {
        return 'Technology imagery: screens, devices, code, circuit patterns, holographic elements. Keep it modern and clean.';
    }
    // Health/fitness topics
    if (t.includes('health') || t.includes('fitness') || t.includes('workout') || t.includes('diet') || t.includes('weight')) {
        return 'Health/fitness imagery: gym equipment, healthy food, athletic poses, transformation visuals.';
    }
    // Destruction/breaking topics
    if (t.includes('break') || t.includes('end') || t.includes('destroy') || t.includes('ruin') || t.includes('fail')) {
        return 'Destruction imagery: cracking, shattering, crumbling objects related to the topic. Sparks, debris, dramatic breaking.';
    }
    // Secret/expose topics
    if (t.includes('expose') || t.includes('truth') || t.includes('secret') || t.includes('reveal') || t.includes('hidden')) {
        return 'Revelation imagery: spotlights, unveiling curtains, magnifying glasses, documents, dramatic lighting revealing something.';
    }

    // Default: Don't force a visual element - focus on person and typography
    return 'ONLY add a visual element if it DIRECTLY relates to the specific topic. If no obvious visual fits, focus entirely on the person and typography - a powerful expression with bold text is often more effective than a forced, unrelated graphic.';
}

/**
 * Get design principles for viral thumbnail composition
 * These are PRINCIPLES, not literal elements - the AI should apply them intelligently
 * based on what makes sense for the specific topic
 */
function getDesignPrinciples() {
    return `
VIRAL THUMBNAIL DESIGN PRINCIPLES (Apply intelligently based on topic):

1. LAYERING & DEPTH (Create visual hierarchy):
   - Use 3-4 distinct layers: background → middle elements → foreground/character
   - Each layer should have different focus/blur levels
   - Background: environmental context or gradient with depth
   - Middle: supporting visual elements relevant to the topic
   - Foreground: person and primary text

2. RULE OF THIRDS PLACEMENT:
   - Position the character on the left or right third (not center)
   - Key visual elements should fall on intersection points
   - Create visual flow that guides the eye through the composition

3. BOLD TYPOGRAPHY WITH SEPARATION:
   - Main text should have strong visual weight (3D, shadows, outlines)
   - Clear visual separation between title and subtitle (if applicable)
   - Text must not overlap with face - typically positioned at top

4. HIGH CONTRAST & SATURATION:
   - Vibrant, punchy colors (+25% saturation boost)
   - Strong light/dark contrast for impact
   - Rim lighting on character to separate from background

5. TOPIC-RELEVANT VISUAL ELEMENTS (CRITICAL):
   - Every visual element MUST logically connect to the Main Topic and Sub-Topic
   - Ask yourself: "Does this object/symbol directly relate to what the topic is about?"
   - DO NOT add generic elements like question marks, random icons, or abstract shapes unless they specifically relate to the topic
   - If the topic is about religion, show religious imagery (crosses, churches, prayer hands, etc.)
   - If the topic is about money, show money-related imagery
   - If NO relevant visual element makes sense, focus entirely on the person and typography - that's perfectly fine
   - WRONG: Adding a broken question mark for a topic about prayer (question marks aren't about prayer)
   - RIGHT: Adding a crumbling church or fading cross for a topic about "rotten prayer" (directly related)

6. DYNAMIC ENERGY:
   - Subtle motion cues: light rays, particles, bokeh
   - Diagonal lines or angles for visual interest
   - Avoid static, flat compositions
`.trim();
}

/**
 * Get creative direction guidance - empowers AI to make topic-driven decisions
 * Encourages visual storytelling, dramatic composition changes, and conceptual reframing
 */
function getCreativeGuidance(variationNumber, topic, subTopic, category) {
    return `
=== VARIATION ${variationNumber} OF 4 - CREATE A UNIQUE VISUAL STORY ===

You are creating variation ${variationNumber} of 4 thumbnails for the same topic.
Each variation must tell the story DIFFERENTLY - not just change colors or poses.

TOPIC CONTEXT:
- Main Topic: "${topic}"
- Sub-topic: "${subTopic || 'None'}"
- Category: ${category}

=== THINK LIKE A CREATIVE DIRECTOR ===

Before designing, ask yourself: "What's an interesting ANGLE or STORY I can tell about '${topic}'?"

Each variation should explore a DIFFERENT CONCEPT, such as:
- The CONFRONTATION angle (show conflict or tension related to the topic)
- The MYSTERY angle (create intrigue, questions, secrets being revealed)
- The TEACHING angle (person explaining, demonstrating, showing evidence)
- The WARNING angle (danger, caution, things to avoid)
- The REVELATION angle (discovery, "aha moment", truth being unveiled)
- The DEBUNKING angle (crossing out myths, showing what's wrong)

=== VISUAL STORYTELLING ELEMENTS ===

Don't just show a person with text. CREATE A SCENE by adding:

1. **SUPPORTING VISUAL ELEMENTS** that tell the story:
   - Other characters or figures (if the topic involves conflict, show who/what)
   - Symbolic objects that represent the topic (not just held, but as scene elements)
   - Visual metaphors (blood drops for blood topics, chains for bondage topics, light rays for revelation)

2. **DRAMATIC PROPS** the person INTERACTS with:
   - Not just holding a book - READING it with visible reaction
   - Not just standing - POINTING AT something specific in the scene
   - Not just posing - REACTING TO something happening

3. **VISUAL ARGUMENTS** when appropriate:
   - Crossing out false things with X marks
   - Before/after splits showing transformation
   - Comparison imagery (this vs that)

=== COMPOSITION VARIATION ===

Each thumbnail should have a DRAMATICALLY different layout:
- Variation might have person LARGE and central with supporting elements around
- Another might have person SMALLER with a giant symbolic element dominating
- Another might have SPLIT composition (person on one side, visual story on other)
- Another might have person INTERACTING with scene elements

=== YOUR CREATIVE CHOICES ===

1. **CONCEPTUAL ANGLE** - What story/angle are you telling for this variation?

2. **COMPOSITION** - How is the frame organized? Where is the person? What dominates?

3. **VISUAL ELEMENTS** - What objects, figures, or symbols support the story?

4. **PERSON'S ROLE** - Is the person confronting? Teaching? Reacting? Warning? Discovering?

5. **TYPOGRAPHY** - What style fits THIS interpretation? (dripping horror text? clean authoritative? mysterious glow?)

6. **COLOR MOOD** - What palette tells THIS version of the story?

7. **CLOTHING** - What outfit fits the role the person plays in this scene?

=== CRITICAL REQUIREMENTS ===

- This MUST look like a completely different creative concept from the other 3 variations
- Add visual storytelling elements - don't just show a person with text
- The person should be ENGAGED with the scene, not just posing
- Every visual element must relate to "${topic}"
- Make it look like a professional YouTube thumbnail that tells a story at a glance

Think: "If I saw all 4 variations side by side, would each one feel like a different creative take on the topic?"
`.trim();
}

/**
 * Build the thumbnail generation prompt
 * Uses design PRINCIPLES that the AI applies intelligently based on the topic
 * Each of the 4 thumbnails explores a different visual approach
 */
function buildThumbnailPrompt(params) {
    const {
        topic,
        subTopic,
        category,
        expression, // User's selected expression - this is the PRIMARY driver for facial expression
        aspectRatio,
        styleDescription,
        characterAnchor,
        variationNumber = 1,
        creativeTitles = false // When true, AI can create viral title variations
    } = params;

    const orientation = aspectRatio === '16:9' ? 'landscape (16:9)' : 'portrait (9:16)';

    // Get the design principles (consistent across all variations)
    const designPrinciples = getDesignPrinciples();

    // Get creative guidance - AI makes topic-driven decisions, not templates
    const creativeGuidance = getCreativeGuidance(variationNumber, topic, subTopic, category);

    const visualHook = getVisualHook(topic);
    const backgroundStyle = getBackgroundStyle(topic, category);

    // Build character anchor section - use user's anchor or the default
    const characterSection = characterAnchor
        ? `CHARACTER ANCHOR ATTRIBUTES (Do not deviate):\n${characterAnchor}`
        : DEFAULT_CHARACTER_ANCHOR;

    // Build content section - only include subtopic if provided
    const hasSubTopic = subTopic && subTopic.trim().length > 0;

    // Creative titles section - when enabled, AI MUST generate viral title variations
    const creativeTitlesSection = creativeTitles
        ? `
=== CREATIVE TITLE MODE - MANDATORY ===

*** DO NOT USE THE EXACT TITLES PROVIDED ***

You MUST create a VIRAL TITLE VARIATION for this thumbnail. DO NOT just copy "${topic}".

The user's original topic is: "${topic}"
${hasSubTopic ? `The user's original sub-topic is: "${subTopic}"` : ''}

You MUST REWRITE these into a more viral, attention-grabbing title. Here are approaches to use:

FOR THIS VARIATION (Variation ${variationNumber}), use one of these hook styles:
${variationNumber === 1 ? '- USE A QUESTION HOOK: "Are Vampires Real?" / "Is [Topic] Biblical?" / "What Does The Bible Say About [Topic]?"' : ''}
${variationNumber === 2 ? '- USE A REVELATION HOOK: "[Topic] Secrets Exposed" / "The Truth About [Topic]" / "What They Hide About [Topic]"' : ''}
${variationNumber === 3 ? '- USE A WARNING HOOK: "WARNING: [Topic]" / "The Danger of [Topic]" / "Don\'t Ignore This About [Topic]"' : ''}
${variationNumber === 4 ? '- USE A MYSTERY/CONTROVERSY HOOK: "The Hidden Truth" / "Why [Topic] Is Wrong" / "[Topic]: Debunked"' : ''}

REQUIREMENTS:
1. DO NOT write "${topic}" as the title - create something MORE VIRAL
2. The new title must capture the essence of the topic but be more click-worthy
3. Make it SHORT, PUNCHY, and ATTENTION-GRABBING
4. This variation's title MUST be different from the other 3 variations

EXAMPLE: If topic is "Vampires & The Bible", you might write:
- "ARE VAMPIRES REAL?" (question hook)
- "BLOOD SECRETS EXPOSED" (revelation hook)
- "THE BIBLICAL TRUTH" (mystery hook)
- "WHAT THE BIBLE WARNS" (warning hook)

*** REMEMBER: DO NOT JUST COPY THE ORIGINAL TITLE - CREATE A VIRAL VERSION ***
`
        : '';

    const contentSection = hasSubTopic
        ? `CONTENT REFERENCE (${creativeTitles ? 'FOR INSPIRATION - DO NOT USE EXACTLY' : 'USE EXACTLY'}):
- Original Topic: "${topic}"
- Original Sub-Topic: "${subTopic}"
${!creativeTitles ? '- USE THESE EXACT TITLES - do not modify or rewrite them' : '- CREATE A VIRAL REWRITE - do not use these exact words'}`
        : `CONTENT REFERENCE (${creativeTitles ? 'FOR INSPIRATION - DO NOT USE EXACTLY' : 'USE EXACTLY'}):
- Original Topic: "${topic}"
- Sub-Topic: NONE - DO NOT ADD ANY SUBTITLE TEXT
${!creativeTitles ? '- USE THIS EXACT TITLE - do not modify or rewrite it' : '- CREATE A VIRAL REWRITE - do not use these exact words'}`;

    // Build typography section based on whether subtopic exists
    // Typography STYLE is now chosen by AI based on topic - this section covers placement and spelling
    // For 9:16 portrait thumbnails, enforce TikTok/Reels safe zone constraints
    const isPortrait = aspectRatio === '9:16';

    // Portrait 9:16: text goes in the center safe zone; Landscape 16:9: text at top as before
    const textPlacement = isPortrait
        ? 'Main Topic text positioned in the VERTICAL CENTER of the image (between the upper-third and mid-section)'
        : 'Main Topic text positioned at TOP of image';

    const typographySection = hasSubTopic
        ? `TYPOGRAPHY PLACEMENT & SPELLING:
- ${textPlacement}
- Sub-Topic text placed directly below the main topic
- TEXT MUST BE SPELLED CORRECTLY - double-check every letter matches the provided topic exactly
- Text should NOT overlap with the character's face
- YOU CHOOSE the typography STYLE (bold, chrome, neon, distressed, etc.) based on what fits the topic's tone`
        : `TYPOGRAPHY PLACEMENT & SPELLING:
- ${textPlacement}
- NO SUBTITLE: There is no sub-topic, so DO NOT add any subtitle, tagline, or secondary text
- TEXT MUST BE SPELLED CORRECTLY - double-check every letter matches the provided topic exactly
- Text should NOT overlap with the character's face
- YOU CHOOSE the typography STYLE (bold, chrome, neon, distressed, etc.) based on what fits the topic's tone`;

    // Build a standalone safe zone block that goes near the top of the prompt for 9:16
    const safeZoneBlock = isPortrait
        ? `
=== MANDATORY: TIKTOK / REELS SAFE ZONE (9:16 PORTRAIT) ===

This is a 1080×1920 portrait thumbnail designed for TikTok, Reels, and Shorts.
These platforms overlay UI elements (username, captions, like/comment buttons) on the top and bottom of the image.

*** ABSOLUTE RULE — NO EXCEPTIONS ***:
- The TOP 8% of the canvas (top ~150 pixels) must contain NO text whatsoever
- The BOTTOM 25% of the canvas (bottom ~480 pixels) must contain NO text whatsoever
- ALL text (titles, subtitles, any words) MUST be placed in the CENTER SAFE ZONE only
- The safe zone is roughly the middle 67% of the image height
- Think of it as: leave the top eighth and bottom quarter completely empty of any text or lettering
- Place text in the vertical middle band of the image, roughly between the upper-third and lower-third lines
- The person/character can extend into the top and bottom areas, but TEXT CANNOT
`
        : '';


    // Log variation for debugging
    logger.info(`Thumbnail variation ${variationNumber}: Generating with principle-based approach`, {
        variationNumber,
        topic: topic.substring(0, 50),
        creativeTitles: creativeTitles // Log whether creative titles is enabled
    });

    return `
SYSTEM ROLE: Expert YouTube Thumbnail Designer creating PHOTOREALISTIC viral thumbnails.
TASK: Generate a high-CTR, viral-style thumbnail in ${orientation} orientation.
VARIATION: ${variationNumber} of 4 - Each variation MUST look dramatically different!
${safeZoneBlock}
${creativeTitles ? `TEXT RULES (CREATIVE MODE):
- You have creative license to generate viral title variations (see CREATIVE TITLE MODE section below)
- Text must be clearly readable and professionally styled
- DO NOT add random letters, symbols, or gibberish
- If you cannot render text clearly, OMIT IT ENTIRELY rather than rendering incorrectly
` : `CRITICAL TEXT RULES (MANDATORY - READ CAREFULLY):
- ONLY include text that EXACTLY matches the Main Topic${hasSubTopic ? ' and Sub-Topic' : ''} provided below
- DO NOT add any additional text, words, labels, watermarks, or captions
- DO NOT invent, modify, abbreviate, or misspell any words
- DO NOT add random letters, symbols, or gibberish text anywhere in the image
- If you cannot render text clearly and correctly, OMIT IT ENTIRELY rather than rendering it incorrectly
${hasSubTopic ? '- Every word in the image must come directly from the topic/subtopic - no exceptions' : '- The ONLY text allowed is the Main Topic - absolutely NO other text'}`}

REALISM REQUIREMENTS (MANDATORY):
- The person MUST look like a real photograph, NOT digital art, CGI, or illustration
- Skin should have natural texture, pores, and subtle imperfections
- The final image should be indistinguishable from a professional studio photograph
- NO cyberpunk, neon-outline, or sci-fi aesthetic unless specifically requested in the topic

${contentSection}
${creativeTitlesSection}

=== CRITICAL: CHARACTER CREATION RULES ===

FACIAL LIKENESS ONLY - Use the reference images to match:
- Face shape, bone structure, and proportions
- Skin tone and complexion
- Eye shape, color, and spacing
- Nose and mouth shape
- Age appearance
- Any permanent features (bald head, facial hair pattern, etc.)

EVERYTHING ELSE SHOULD BE CREATED FRESH FOR THIS THUMBNAIL:
- POSE: Create a NEW pose as specified in the variation instructions below (DO NOT copy the pose from reference images)
- CLOTHING: Design NEW attire that fits the topic and variation mood (DO NOT copy outfits from reference images)
- ACCESSORIES: Feel free to add glasses, watches, jewelry if it enhances the thumbnail
- BODY POSITION: Generate the body position required by this variation's pose instructions

The reference images show you WHAT THE PERSON LOOKS LIKE (their face).
They do NOT show you how to pose them - that comes from the variation instructions below.

Think of it like this: You are a photographer who has been shown photos of a client.
Now you must photograph that same person in a completely NEW pose and NEW outfit.

${characterSection}

=== FACIAL EXPRESSION (USER'S SELECTION - THIS IS MANDATORY) ===

The user has specifically chosen this expression type. This MUST be the character's facial expression:

Expression Type: ${expression.name}
Primary Emotion: ${expression.primary_emotion}
Face Details: ${expression.face_details}
Eyes: ${expression.eye_details}
Intensity Level: ${expression.intensity}/10 (YouTube "Face" style - expressive but natural)

IMPORTANT: The expression above is what the user selected. Apply this expression to whatever POSE you choose.
For example: If you decide a pointing pose fits the topic and the user selected "Shocked" expression,
show the person POINTING with a SHOCKED facial expression.

${creativeGuidance}

=== DESIGN PRINCIPLES ===

${designPrinciples}

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

FINAL CHECKLIST:
1. Does the person's FACE match the reference (same person)?
2. Is the POSE a creative choice that fits the topic?
3. Is the EXPRESSION matching the USER'S SELECTED expression type (${expression.name})?
4. Is the CLOTHING newly created and appropriate for the ${category} category?
5. Is the TYPOGRAPHY STYLE a creative choice that fits the topic's tone?
${creativeTitles ? `6. *** CRITICAL ***: Did you create a NEW VIRAL TITLE? (You must NOT use "${topic}" exactly - create a hook like "Are [Topic] Real?" or "[Topic] Secrets Exposed")
7. Is the title DIFFERENT from the other 3 variations?` : `6. Is the Main Topic text spelled exactly as provided?
${hasSubTopic ? '7. Is the Sub-Topic text spelled exactly as provided?' : '7. Is there ANY subtitle or secondary text? (If yes, REMOVE IT - only Main Topic allowed)'}`}
8. Are the visual elements DIRECTLY RELEVANT to the topic?
9. Does this variation look DISTINCTLY DIFFERENT from the other 3 (not a template)?
${isPortrait ? `10. *** SAFE ZONE CHECK ***: Is ALL text placed in the vertical center of the image? (NO text in the top 8% or bottom 25% of the canvas — this is mandatory for TikTok/Reels)` : ''}
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
async function editThumbnail(baseImageData, instruction, topic = null, subTopic = null, retries = 3) {
    logger.info(`Using Gemini model: ${GEMINI_IMAGE_MODEL} for thumbnail editing`);

    // Build text requirements section if topic is provided
    let textRequirements = '';
    if (topic) {
        textRequirements = `
CRITICAL TEXT REQUIREMENTS:
- Main Topic text MUST read exactly: "${topic}"
${subTopic ? `- Sub-Topic text MUST read exactly: "${subTopic}"` : '- Do NOT add any subtitle text unless one already exists'}
- Spell every word EXACTLY as shown above - do not paraphrase or abbreviate
- If you cannot render the text correctly, omit it rather than misspell it
`;
    }

    const editPrompt = `Edit this thumbnail. INSTRUCTION: ${instruction}.
${textRequirements}
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
     * Each thumbnail gets a different composition style based on topic analysis
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
            jobId,
            creativeTitles = false
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
                // Each variation explores a different visual approach using principle-based guidance
                const prompt = buildThumbnailPrompt({
                    topic,
                    subTopic,
                    category: categoryKey,
                    expression,
                    aspectRatio,
                    styleDescription: style.description,
                    characterAnchor: effectiveCharacterAnchor,
                    variationNumber: i + 1,
                    creativeTitles
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

        // Edit with Gemini - pass topic/subTopic to ensure correct text rendering
        const editedImageData = await editThumbnail(base64, instruction, original.topic, original.sub_topic);

        // Generate meaningful public ID: thumb_v{videoId}_{style}_refined_v{version}_{timestamp}
        const newVersion = (original.version || 0) + 1;
        const timestamp = Date.now();
        const publicId = `thumb_v${original.video_id}_${original.style_name}_refined_v${newVersion}_${timestamp}`;

        // Store the old Cloudinary public ID before uploading new version
        const oldCloudinaryPublicId = original.cloudinary_public_id;

        // Upload edited version using uploadImage directly (NOT uploadThumbnail)
        // This skips the limit enforcement logic since we're REPLACING, not adding
        const aspectRatioTag = original.aspect_ratio ? `ratio_${original.aspect_ratio.replace(':', 'x')}` : 'ratio_16x9';
        const uploadResult = await cloudinaryService.uploadImage(
            editedImageData,
            {
                userId,
                videoId: original.video_id,
                publicId,
                tags: ['thumbnail', `video_${original.video_id}`, aspectRatioTag]
            }
        );

        // Update the existing thumbnail record instead of creating a new one
        // This replaces the thumbnail in-place, preserving the same ID
        const updateResult = await database.query(
            `UPDATE video_thumbnails SET
                cloudinary_public_id = $1,
                cloudinary_url = $2,
                cloudinary_secure_url = $3,
                file_size_bytes = $4,
                width = $5,
                height = $6,
                format = $7,
                version = $8,
                refinement_instruction = $9,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10 AND users_id = $11
            RETURNING *`,
            [
                uploadResult.publicId,
                uploadResult.url,
                uploadResult.secureUrl,
                uploadResult.bytes,
                uploadResult.width,
                uploadResult.height,
                uploadResult.format,
                newVersion,
                instruction,
                thumbId,
                userId
            ]
        );

        // Delete the old Cloudinary image after successful update
        try {
            await cloudinaryService.deleteImage(oldCloudinaryPublicId);
            logger.info(`Deleted old Cloudinary image: ${oldCloudinaryPublicId}`);
        } catch (deleteError) {
            // Log but don't fail - the new image is already in place
            logger.warn(`Failed to delete old Cloudinary image ${oldCloudinaryPublicId}:`, deleteError.message);
        }

        logger.info(`Thumbnail refined successfully (replaced in-place): ${uploadResult.publicId}`);

        return updateResult.rows[0];
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
