const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('../utils');

class AIChatService {
  constructor() {
    this.gemini = null;
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
        model = 'gemini-flash-latest'
        //model = 'gemini-2.5-pro'
      } = options;

      logger.debug('Generating content with Gemini', {
        model,
        temperature,
        maxTokens,
        promptLength: prompt.length
      });

      const genAI = this.gemini.getGenerativeModel({ model });

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
      const text = response.text();
      const endTime = Date.now();
      const duration = endTime - startTime;

      const metrics = {
        responseLength: text.length,
        tokensUsed: response.usageMetadata?.totalTokenCount || null,
        inputTokens: response.usageMetadata?.promptTokenCount || null,
        outputTokens: response.usageMetadata?.candidatesTokenCount || null,
        duration: duration
      };

      logger.debug('Gemini generation successful', metrics);

      return { text, metrics };

    } catch (error) {
      logger.error('Error generating content with Gemini:', {
        error: error.message,
        code: error.code,
        status: error.status
      });
      throw new Error(`Gemini generation failed: ${error.message}`);
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
        temperature = 0.7,
        maxTokens = 2000,
        //model = 'claude-3-haiku-20240307'
        model = 'claude-sonnet-4-5'
      } = options;

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

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        logger.debug(`AI generation attempt ${attempt}/${maxRetries + 1} for ${provider}`);
        const result = await this.generateContent(provider, options);

        if (attempt > 1) {
          logger.info(`AI generation succeeded on attempt ${attempt} for ${provider}`);
        }

        return result;
      } catch (error) {
        lastError = error;
        logger.warn(`AI generation attempt ${attempt} failed for ${provider}:`, error.message);

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
}

module.exports = new AIChatService();
