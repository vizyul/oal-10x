const { GoogleGenerativeAI } = require('@google/generative-ai');
const { VertexAI } = require('@google-cloud/vertexai');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('../utils');

class AIChatService {
  constructor() {
    this.gemini = null;
    this.vertexai = null;
    this.openai = null;
    this.anthropic = null;
    this.init();
  }

  /**
   * Initialize AI services
   */
  init() {
    try {
      // Initialize Google Gemini
      if (process.env.GOOGLE_AI_API_KEY) {
        this.gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
        logger.info('Google Gemini AI service initialized');
      } else {
        logger.warn('GOOGLE_AI_API_KEY not found - Gemini features disabled');
      }

      // Initialize OpenAI
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        logger.info('OpenAI ChatGPT service initialized');
      } else {
        logger.warn('OPENAI_API_KEY not found - ChatGPT features disabled');
      }

      // Initialize Anthropic Claude
      if (process.env.ANTHROPIC_API_KEY) {
        this.anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        });
        logger.info('Anthropic Claude service initialized');
      } else {
        logger.warn('ANTHROPIC_API_KEY not found - Claude features disabled');
      }

      // Initialize Google Vertex AI (for Imagen 4 image generation)
      if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
        try {
          const vertexConfig = {
            project: process.env.GOOGLE_CLOUD_PROJECT_ID,
            location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
          };

          // Support credentials from JSON string in env var (recommended for production)
          if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
            try {
              const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
              vertexConfig.googleAuthOptions = { credentials };
              logger.info('Using Vertex AI credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON');
            } catch (parseError) {
              logger.error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', parseError.message);
              throw parseError;
            }
          } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            // File path approach - SDK will use this automatically
            logger.info('Using Vertex AI credentials from file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
          } else {
            logger.warn('No Vertex AI credentials configured - using Application Default Credentials');
          }

          this.vertexai = new VertexAI(vertexConfig);
          logger.info('Google Vertex AI service initialized (Imagen 4 available)');
        } catch (vertexError) {
          logger.warn('Failed to initialize Vertex AI:', vertexError.message);
          this.vertexai = null;
        }
      } else {
        logger.warn('GOOGLE_CLOUD_PROJECT_ID not found - Vertex AI Imagen 4 disabled');
      }

      if (!this.gemini && !this.openai && !this.anthropic) {
        logger.error('No AI services configured. Please add GOOGLE_AI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY');
      }

    } catch (error) {
      logger.error('Failed to initialize AI services:', error);
    }
  }

  /**
   * Generate content using Gemini
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Generated content
   */
  async generateWithGemini(options) {
    try {
      if (!this.gemini) {
        throw new Error('Gemini not configured');
      }

      const {
        prompt,
        systemMessage = '',
        temperature = 0.7,
        maxTokens = 2000,
        //model = 'gemini-1.5-flash'
        //model = 'gemini-flash-lite-latest'
        model = 'gemini-flash-latest',
        //model = 'gemini-2.5-pro'
        contentType = 'unknown'
      } = options;

      logger.debug('Generating content with Gemini', {
        model,
        temperature,
        maxTokens,
        promptLength: prompt.length
      });

      // Configure relaxed safety settings for legitimate content (religious, educational, etc.)
      const safetySettings = [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
      ];

      const genAI = this.gemini.getGenerativeModel({
        model,
        safetySettings
      });

      // Combine system message with prompt if provided
      const fullPrompt = systemMessage ? `${systemMessage}\n\n${prompt}` : prompt;

      const generationConfig = {
        temperature,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: maxTokens,
      };

      const startTime = Date.now();
      const result = await genAI.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig
      });

      const response = await result.response;

      // Check for content filtering/blocking
      const blockReason = response.promptFeedback?.blockReason;
      const finishReason = response.candidates?.[0]?.finishReason;
      const safetyRatings = response.candidates?.[0]?.safetyRatings || response.promptFeedback?.safetyRatings;
      const usageMetadata = response?.usageMetadata;

      // ===== SAFETY FILTER DETECTION =====
      if (blockReason) {
        const errorDetails = {
          type: 'SAFETY_FILTER',
          blockReason,
          safetyRatings,
          message: `Content blocked by safety filter: ${blockReason}`,
          promptLength: fullPrompt.length,
          inputTokens: usageMetadata?.promptTokenCount || 'unknown'
        };

        // Log prominently for server
        logger.error('🚫 SAFETY FILTER BLOCKED - Gemini refused to generate content', errorDetails);
        console.error('[GEMINI SAFETY FILTER]', JSON.stringify(errorDetails, null, 2));

        const error = new Error(errorDetails.message);
        error.code = 'CONTENT_FILTERED';
        error.blockReason = blockReason;
        error.frontendMessage = `Safety Filter: ${blockReason}`;
        error.details = errorDetails;
        throw error;
      }

      if (finishReason === 'SAFETY') {
        const errorDetails = {
          type: 'SAFETY_FILTER',
          finishReason,
          safetyRatings,
          message: 'Content generation stopped due to safety filters',
          promptLength: fullPrompt.length,
          inputTokens: usageMetadata?.promptTokenCount || 'unknown'
        };

        // Log prominently for server
        logger.error('🚫 SAFETY FILTER STOPPED - Gemini stopped generation mid-way', errorDetails);
        console.error('[GEMINI SAFETY FILTER]', JSON.stringify(errorDetails, null, 2));

        const error = new Error(errorDetails.message);
        error.code = 'CONTENT_FILTERED';
        error.finishReason = finishReason;
        error.frontendMessage = 'Safety Filter: Generation stopped';
        error.details = errorDetails;
        throw error;
      }

      // ===== TOKEN LIMIT DETECTION =====
      if (finishReason === 'MAX_TOKENS') {
        const errorDetails = {
          type: 'TOKEN_LIMIT',
          finishReason,
          message: 'Response truncated due to token limit',
          requestedMaxTokens: maxTokens,
          inputTokens: usageMetadata?.promptTokenCount || 'unknown',
          outputTokens: usageMetadata?.candidatesTokenCount || 'unknown',
          totalTokens: usageMetadata?.totalTokenCount || 'unknown'
        };

        // Log prominently for server - this is a warning, content may still be usable
        logger.warn(`⚠️ TOKEN LIMIT REACHED [${contentType}] - Response was truncated`, errorDetails);
        console.warn(`[GEMINI TOKEN LIMIT] ${contentType}`, JSON.stringify(errorDetails, null, 2));

        // Don't throw, just log - the content may still be usable
      }

      // Log full response details before extracting text
      logger.debug('Gemini raw response details', {
        hasResponse: !!response,
        hasCandidates: !!response?.candidates,
        candidatesCount: response?.candidates?.length || 0,
        finishReason: response?.candidates?.[0]?.finishReason,
        hasContent: !!response?.candidates?.[0]?.content,
        partsCount: response?.candidates?.[0]?.content?.parts?.length || 0,
        usageMetadata: response?.usageMetadata
      });

      const text = response.text();

      if (!text || text.trim().length === 0) {
        // ===== EMPTY RESPONSE DETECTION =====
        const errorDetails = {
          type: 'EMPTY_RESPONSE',
          message: 'Gemini returned empty content',
          finishReason: response?.candidates?.[0]?.finishReason,
          promptLength: fullPrompt.length,
          inputTokens: usageMetadata?.promptTokenCount || 'unknown',
          outputTokens: usageMetadata?.candidatesTokenCount || 0,
          candidates: response?.candidates?.length || 0,
          promptFeedback: response?.promptFeedback
        };

        // Log prominently for server
        logger.error('❌ EMPTY RESPONSE - Gemini returned no content', errorDetails);
        console.error('[GEMINI EMPTY RESPONSE]', JSON.stringify(errorDetails, null, 2));

        const error = new Error('Gemini returned empty content');
        error.code = 'EMPTY_RESPONSE';
        error.frontendMessage = 'Empty Response: No content generated';
        error.details = errorDetails;
        throw error;
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      const metrics = {
        responseLength: text.length,
        tokensUsed: response.usageMetadata?.totalTokenCount || null,
        inputTokens: response.usageMetadata?.promptTokenCount || null,
        outputTokens: response.usageMetadata?.candidatesTokenCount || null,
        duration: duration
      };

      logger.info('✅ Gemini generation successful', {
        responseLength: text.length,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        duration: `${duration}ms`
      });

      return { text, metrics };

    } catch (error) {
      // Preserve detailed error information
      const errorDetails = {
        type: error.code || 'UNKNOWN_ERROR',
        message: error.message,
        code: error.code,
        status: error.status,
        frontendMessage: error.frontendMessage || error.message,
        details: error.details || null
      };

      logger.error('❌ Error generating content with Gemini:', errorDetails);
      console.error('[GEMINI ERROR]', JSON.stringify(errorDetails, null, 2));

      // Create new error that preserves all the details
      const newError = new Error(`Gemini generation failed: ${error.message}`);
      newError.code = error.code || 'GENERATION_FAILED';
      newError.frontendMessage = error.frontendMessage || error.message;
      newError.details = error.details || errorDetails;
      throw newError;
    }
  }

  /**
   * Generate content using ChatGPT
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Generated content
   */
  async generateWithChatGPT(options) {
    try {
      if (!this.openai) {
        throw new Error('OpenAI not configured');
      }

      const {
        prompt,
        systemMessage = '',
        temperature = 0.7,
        maxTokens = 2000,
        //model = 'gpt-4o-mini'
        model = 'gpt-5.1'
      } = options;

      logger.debug('Generating content with ChatGPT', {
        model,
        temperature,
        maxTokens,
        promptLength: prompt.length
      });

      const messages = [];

      if (systemMessage) {
        messages.push({ role: 'system', content: systemMessage });
      }

      messages.push({ role: 'user', content: prompt });

      const startTime = Date.now();
      const completion = await this.openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: 0.95
      });

      const text = completion.choices[0]?.message?.content;
      const endTime = Date.now();
      const duration = endTime - startTime;

      if (!text) {
        throw new Error('No content generated from ChatGPT');
      }

      const metrics = {
        responseLength: text.length,
        tokensUsed: completion.usage?.total_tokens || null,
        inputTokens: completion.usage?.prompt_tokens || null,
        outputTokens: completion.usage?.completion_tokens || null,
        finishReason: completion.choices[0]?.finish_reason,
        duration: duration
      };

      logger.debug('ChatGPT generation successful', metrics);

      return { text, metrics };

    } catch (error) {
      logger.error('Error generating content with ChatGPT:', {
        error: error.message,
        code: error.code,
        status: error.status,
        type: error.type
      });
      throw new Error(`ChatGPT generation failed: ${error.message}`);
    }
  }

  /**
   * Generate content using Claude
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Generated content
   */
  async generateWithClaude(options) {
    try {
      if (!this.anthropic) {
        throw new Error('Anthropic Claude not configured');
      }

      const {
        prompt,
        systemMessage = '',
        temperature: rawTemperature = 0.7,
        maxTokens = 2000,
        //model = 'claude-3-haiku-20240307'
        model = 'claude-sonnet-4-5'
      } = options;

      // Ensure temperature is a valid number (database may return string)
      const temperature = parseFloat(rawTemperature) || 0.7;

      logger.debug('Generating content with Claude', {
        model,
        temperature,
        maxTokens,
        promptLength: prompt.length
      });

      const messages = [];
      messages.push({ role: 'user', content: prompt });

      const startTime = Date.now();
      const completion = await this.anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemMessage || undefined,
        messages
      });

      const text = completion.content[0]?.text;
      const endTime = Date.now();
      const duration = endTime - startTime;

      if (!text) {
        throw new Error('No content generated from Claude');
      }

      const metrics = {
        responseLength: text.length,
        tokensUsed: (completion.usage?.input_tokens || 0) + (completion.usage?.output_tokens || 0) || null,
        inputTokens: completion.usage?.input_tokens || null,
        outputTokens: completion.usage?.output_tokens || null,
        stopReason: completion.stop_reason,
        duration: duration
      };

      logger.debug('Claude generation successful', metrics);

      return { text, metrics };

    } catch (error) {
      logger.error('Error generating content with Claude:', {
        error: error.message,
        code: error.code,
        status: error.status,
        type: error.type
      });
      throw new Error(`Claude generation failed: ${error.message}`);
    }
  }

  /**
   * Generate content using specified AI provider
   * @param {string} provider - AI provider ('gemini', 'chatgpt', or 'claude')
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Generated content
   */
  async generateContent(provider, options) {
    try {
      switch (provider.toLowerCase()) {
      case 'gemini':
        return await this.generateWithGemini(options);
      case 'chatgpt':
        return await this.generateWithChatGPT(options);
      case 'claude':
        return await this.generateWithClaude(options);
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
      }
    } catch (error) {
      logger.error(`AI content generation failed for provider ${provider}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate content with retry logic
   * @param {string} provider - AI provider
   * @param {Object} options - Generation options
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<string>} Generated content
   */
  async generateContentWithRetry(provider, options, maxRetries = 2) {
    let lastError;
    let currentProvider = provider;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        logger.debug(`AI generation attempt ${attempt}/${maxRetries + 1} for ${currentProvider}`);
        const result = await this.generateContent(currentProvider, options);

        if (attempt > 1) {
          logger.info(`AI generation succeeded on attempt ${attempt} for ${currentProvider}`);
        }

        return result;
      } catch (error) {
        lastError = error;
        logger.warn(`AI generation attempt ${attempt} failed for ${currentProvider}:`, error.message);

        // Check for RECITATION error (Gemini content policy)
        const isRecitationError = error.message && error.message.includes('RECITATION');

        if (isRecitationError) {
          logger.warn(`RECITATION error detected - Gemini blocked content due to similarity to copyrighted material`);

          // Try fallback to OpenAI if available and we were using Gemini
          if (currentProvider === 'gemini' && this.isProviderAvailable('openai')) {
            logger.info(`Attempting fallback to OpenAI for ${options.contentType || 'content'}`);
            currentProvider = 'openai';
            // Don't count this as a retry attempt - it's a provider switch
            attempt--;
            continue;
          }
        }

        if (attempt <= maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = Math.pow(2, attempt - 1) * 1000;
          logger.debug(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Process a prompt template by replacing placeholders
   * @param {string} promptText - Template text with placeholders
   * @param {Object} variables - Variables to replace in template
   * @returns {string} Processed prompt
   */
  processPromptTemplate(promptText, variables = {}) {
    let processed = promptText;

    // Replace {{VARIABLE}} placeholders
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = new RegExp(`{{${key}}}`, 'gi');
      processed = processed.replace(placeholder, value || '');
    });

    // Also handle [INSERT TRANSCRIPT HERE] format for backward compatibility
    if (variables.TRANSCRIPT) {
      processed = processed.replace(/\[INSERT TRANSCRIPT HERE\]/gi, variables.TRANSCRIPT);
    }

    // Log if there are unresolved placeholders
    const unresolvedPlaceholders = processed.match(/{{[^}]+}}/g);
    if (unresolvedPlaceholders) {
      logger.warn('Unresolved placeholders found in prompt:', unresolvedPlaceholders);
    }

    return processed;
  }

  /**
   * Validate AI provider availability
   * @param {string} provider - AI provider name
   * @returns {boolean} Whether provider is available
   */
  isProviderAvailable(provider) {
    switch (provider.toLowerCase()) {
    case 'gemini':
      return !!this.gemini;
    case 'chatgpt':
      return !!this.openai;
    case 'claude':
      return !!this.anthropic;
    default:
      return false;
    }
  }

  /**
   * Get available AI providers
   * @returns {Array<string>} List of available providers
   */
  getAvailableProviders() {
    const providers = [];
    if (this.gemini) providers.push('gemini');
    if (this.openai) providers.push('chatgpt');
    if (this.anthropic) providers.push('claude');
    return providers;
  }

  /**
   * Test AI provider connectivity
   * @param {string} provider - Provider to test
   * @returns {Promise<boolean>} Test result
   */
  async testProvider(provider) {
    try {
      const testPrompt = 'Say "Hello" if you can understand this message.';
      const response = await this.generateContent(provider, {
        prompt: testPrompt,
        maxTokens: 50,
        temperature: 0.1
      });

      // Handle both old string format and new object format
      const text = typeof response === 'string' ? response : response.text;
      const success = text.toLowerCase().includes('hello');
      logger.info(`${provider} test ${success ? 'passed' : 'failed'}:`, text.substring(0, 100));
      return success;
    } catch (error) {
      logger.error(`${provider} test failed:`, error.message);
      return false;
    }
  }

  /**
   * Generate an image using Google Vertex AI Imagen 4
   * @param {string} prompt - Image generation prompt
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated image data (base64)
   */
  async generateImage(prompt, options = {}) {
    try {
      // Use Gemini for image generation
      if (this.gemini) {
        return await this.generateImageWithGemini(prompt, options);
      } else {
        throw new Error('No image generation service configured');
      }
    } catch (error) {
      logger.error('Error generating image:', {
        error: error.message,
        code: error.code,
        status: error.status
      });
      throw new Error(`Image generation failed: ${error.message}`);
    }
  }

  /**
   * Generate an image using Vertex AI Imagen 4
   * @param {string} prompt - Image generation prompt
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated image data (base64)
   */
  async generateImageWithImagen4(prompt, options = {}) {
    try {
      if (!this.vertexai) {
        throw new Error('Vertex AI not configured - cannot generate images with Imagen 4');
      }

      const {
        aspectRatio = '16:9',
        numberOfImages = 1,
        negativePrompt = '',
        personGeneration = 'dont_allow'
      } = options;

      logger.info('Generating image with Vertex AI Imagen 4', {
        promptLength: prompt.length,
        aspectRatio,
        numberOfImages
      });

      const startTime = Date.now();

      // Get the Imagen 4 model from environment variable
      const imagenModel = process.env.VERTEX_IMAGE_MODEL || 'imagen-4.0-generate-001';
      const imageModel = this.vertexai.preview.getGenerativeModel({
        model: imagenModel,
        generationConfig: {
          responseModalities: ['image', 'text']
        }
      });

      // Enhance prompt for better ebook illustrations
      const enhancedPrompt = `Create a professional, high-quality illustration suitable for an ebook.
Style: Clean, modern, educational illustration with good contrast and clarity.
Subject: ${prompt}
Requirements: No text or watermarks in the image. Professional quality suitable for print.`;

      // Generate image
      const result = await imageModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }]
      });

      const response = await result.response;

      // Extract image from response
      let imageData = null;
      let textResponse = '';

      if (response.candidates && response.candidates[0]) {
        const parts = response.candidates[0].content.parts;
        for (const part of parts) {
          if (part.inlineData) {
            imageData = {
              base64: part.inlineData.data,
              mimeType: part.inlineData.mimeType || 'image/png'
            };
          } else if (part.text) {
            textResponse = part.text;
          }
        }
      }

      if (!imageData) {
        throw new Error('No image data returned from Imagen 4');
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      logger.info('Imagen 4 image generation successful', {
        duration: `${duration}ms`,
        mimeType: imageData.mimeType,
        dataLength: imageData.base64.length
      });

      return {
        success: true,
        image: imageData,
        textResponse,
        metrics: {
          duration,
          model: imagenModel
        }
      };

    } catch (error) {
      logger.error('Error generating image with Imagen 4:', {
        error: error.message,
        code: error.code,
        status: error.status
      });
      throw new Error(`Imagen 4 generation failed: ${error.message}`);
    }
  }

  /**
   * Generate an image using Gemini native image generation (fallback)
   * @param {string} prompt - Image generation prompt
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated image data (base64)
   */
  async generateImageWithGemini(prompt, options = {}) {
    try {
      if (!this.gemini) {
        throw new Error('Gemini not configured - cannot generate images');
      }

      const {
        model = 'gemini-2.0-flash-exp',
        aspectRatio = '16:9'
      } = options;

      logger.info('Generating image with Gemini', {
        model,
        promptLength: prompt.length,
        aspectRatio
      });

      const startTime = Date.now();

      // Use the Gemini model for image generation
      const imageModel = this.gemini.getGenerativeModel({
        model,
        generationConfig: {
          responseModalities: ['Text', 'Image']
        }
      });

      // Enhance prompt for hyperrealistic, photographic images
      const enhancedPrompt = `Create a hyperrealistic photograph with the following subject:
${prompt}

Style requirements:
- Hyperrealistic photograph, NOT illustration, NOT digital art, NOT AI-generated looking
- 8K resolution, ultra high detail
- Natural lighting, photojournalistic style
- Shot on professional camera (Canon EOS R5 or Sony A7R IV)
- Shallow depth of field where appropriate
- Real-world textures and materials
- No artificial or cartoon-like elements
- No text or watermarks in the image`;

      const result = await imageModel.generateContent(enhancedPrompt);
      const response = await result.response;

      // Extract image from response
      let imageData = null;
      let textResponse = '';

      if (response.candidates && response.candidates[0]) {
        const parts = response.candidates[0].content.parts;
        for (const part of parts) {
          if (part.inlineData) {
            imageData = {
              base64: part.inlineData.data,
              mimeType: part.inlineData.mimeType || 'image/png'
            };
          } else if (part.text) {
            textResponse = part.text;
          }
        }
      }

      if (!imageData) {
        throw new Error('No image data returned from Gemini');
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      logger.info('Gemini image generation successful', {
        duration: `${duration}ms`,
        mimeType: imageData.mimeType,
        dataLength: imageData.base64.length
      });

      return {
        success: true,
        image: imageData,
        textResponse,
        metrics: {
          duration,
          model
        }
      };

    } catch (error) {
      logger.error('Error generating image with Gemini:', {
        error: error.message,
        code: error.code,
        status: error.status
      });
      throw new Error(`Gemini image generation failed: ${error.message}`);
    }
  }

  /**
   * Check if image generation is available
   * @returns {boolean} Whether image generation is available
   */
  isImageGenerationAvailable() {
    return !!this.gemini;
  }

  /**
   * Get the current image generation provider
   * @returns {string} The provider name ('gemini' or 'none')
   */
  getImageGenerationProvider() {
    if (this.gemini) return 'gemini';
    return 'none';
  }
}

module.exports = new AIChatService();
