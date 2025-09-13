const BaseModel = require('./BaseModel');
const database = require('../services/database.service');
const { logger } = require('../utils');

/**
 * AI Prompts Model
 * Manages AI prompts for content generation with full CRUD operations
 * Currently supports system prompts only. Ready for user-owned prompts once users_id column is added.
 */
class AiPrompts extends BaseModel {
  constructor() {
    super('ai_prompts', 'id');
    
    this.fillable = [
      'name', 'description', 'ai_provider', 'content_type_id', 'prompt_text',
      'system_message', 'temperature', 'max_tokens', 'is_active'
    ];
    
    this.hidden = [];
    
    this.casts = {
      'content_type_id': 'integer',
      'temperature': 'float',
      'max_tokens': 'integer',
      'is_active': 'boolean',
      'created_at': 'date',
      'updated_at': 'date'
    };
  }

  /**
   * Create a new AI prompt
   * @param {object} promptData - Prompt data
   * @returns {Promise<object>} Created prompt
   */
  async createPrompt(promptData) {
    try {
      // Set defaults for optional fields
      const data = {
        temperature: 0.7,
        max_tokens: 2000,
        is_active: true,
        ...promptData
      };

      // Validate required fields
      this.validatePromptData(data);

      return await this.create(data);
    } catch (error) {
      logger.error('Error creating AI prompt:', error);
      throw error;
    }
  }

  /**
   * Update an existing AI prompt
   * @param {number} promptId - Prompt ID
   * @param {object} updateData - Data to update
   * @returns {Promise<object>} Updated prompt
   */
  async updatePrompt(promptId, updateData) {
    try {
      // Validate the update data if it contains critical fields
      if (updateData.ai_provider || updateData.content_type_id || updateData.prompt_text) {
        this.validatePromptData(updateData, false);
      }

      return await this.update(promptId, updateData);
    } catch (error) {
      logger.error(`Error updating AI prompt ${promptId}:`, error);
      throw error;
    }
  }

  /**
   * Delete an AI prompt
   * @param {number} promptId - Prompt ID
   * @returns {Promise<boolean>} Success status
   */
  async deletePrompt(promptId) {
    try {
      return await this.delete(promptId);
    } catch (error) {
      logger.error(`Error deleting AI prompt ${promptId}:`, error);
      throw error;
    }
  }

  /**
   * Get prompt by ID
   * @param {number} promptId - Prompt ID
   * @returns {Promise<object|null>} Prompt object or null
   */
  async getPrompt(promptId) {
    try {
      return await this.findById(promptId);
    } catch (error) {
      logger.error(`Error getting AI prompt ${promptId}:`, error);
      throw error;
    }
  }

  /**
   * Find prompts by AI provider and content type ID
   * @param {string} aiProvider - AI provider (openai, google, claude)
   * @param {number} contentTypeId - Content type ID from content_types table
   * @returns {Promise<object|null>} Matching prompt or null
   */
  async findByProviderAndContentType(aiProvider, contentTypeId) {
    try {
      const query = `
        SELECT ap.*, ct.key as content_type_key, ct.label as content_type_label, ct.icon as content_type_icon
        FROM ${this.tableName} ap
        JOIN content_types ct ON ap.content_type_id = ct.id
        WHERE ap.ai_provider = $1 AND ap.content_type_id = $2 AND ap.is_active = true
        ORDER BY ap.created_at DESC
        LIMIT 1
      `;
      
      const result = await database.query(query, [aiProvider, contentTypeId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding prompt for ${aiProvider}/${contentTypeId}:`, error);
      throw error;
    }
  }

  /**
   * Find prompts by AI provider and content type (legacy method for backward compatibility)
   * @param {string} aiProvider - AI provider (openai, google, claude)
   * @param {string} contentTypeKey - Content type key (blog_text, summary_text, etc.)
   * @returns {Promise<object|null>} Matching prompt or null
   */
  async findByProviderAndType(aiProvider, contentTypeKey) {
    try {
      // Get content type ID from key
      const { contentType } = require('./index');
      const ct = await contentType.findByKey(contentTypeKey);
      if (!ct) {
        logger.warn(`Content type not found: ${contentTypeKey}`);
        return null;
      }
      
      return await this.findByProviderAndContentType(aiProvider, ct.id);
    } catch (error) {
      logger.error(`Error finding prompt for ${aiProvider}/${contentTypeKey}:`, error);
      throw error;
    }
  }

  /**
   * Get all prompts for a specific AI provider
   * @param {string} aiProvider - AI provider
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of prompts with content type keys
   */
  async getByProvider(aiProvider, options = {}) {
    try {
      const query = `
        SELECT 
          ap.*,
          ct.key as content_type,
          ct.label as content_type_label,
          ct.icon as content_type_icon
        FROM ${this.tableName} ap
        JOIN content_types ct ON ap.content_type_id = ct.id
        WHERE ap.ai_provider = $1 
        ${options.includeInactive !== true ? 'AND ap.is_active = true AND ct.is_active = true' : ''}
        ORDER BY ap.created_at DESC
      `;
      
      const result = await database.query(query, [aiProvider]);
      
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error getting prompts for provider ${aiProvider}:`, error);
      throw error;
    }
  }

  /**
   * Get all prompts for a specific content type
   * @param {string|number} contentType - Content type key (string) or ID (number)
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of prompts with content type keys
   */
  async getByContentType(contentType, options = {}) {
    try {
      let query;
      let params;
      
      if (typeof contentType === 'number') {
        // Handle legacy case where contentType is actually an ID
        query = `
          SELECT 
            ap.*,
            ct.key as content_type,
            ct.label as content_type_label,
            ct.icon as content_type_icon
          FROM ${this.tableName} ap
          JOIN content_types ct ON ap.content_type_id = ct.id
          WHERE ap.content_type_id = $1
          ${options.includeInactive !== true ? 'AND ap.is_active = true AND ct.is_active = true' : ''}
          ORDER BY ap.created_at DESC
        `;
        params = [contentType];
      } else {
        // Handle content type key (string)
        query = `
          SELECT 
            ap.*,
            ct.key as content_type,
            ct.label as content_type_label,
            ct.icon as content_type_icon
          FROM ${this.tableName} ap
          JOIN content_types ct ON ap.content_type_id = ct.id
          WHERE ct.key = $1
          ${options.includeInactive !== true ? 'AND ap.is_active = true AND ct.is_active = true' : ''}
          ORDER BY ap.created_at DESC
        `;
        params = [contentType];
      }
      
      const result = await database.query(query, params);
      
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error getting prompts for content type ${contentType}:`, error);
      throw error;
    }
  }

  /**
   * Get user-created prompts (placeholder for future implementation)
   * Note: users_id column doesn't exist yet in current schema
   * @param {number} userId - User ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of user prompts (currently returns empty array)
   */
  async getUserPrompts(userId, options = {}) {
    try {
      logger.info(`getUserPrompts called for user ${userId} - feature not yet implemented`);
      // TODO: Implement once users_id column is added to ai_prompts table
      return [];
    } catch (error) {
      logger.error(`Error getting user prompts for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get all prompts (currently all are system prompts since users_id column doesn't exist)
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of prompts with content type keys
   */
  async getSystemPrompts(options = {}) {
    try {
      const query = `
        SELECT 
          ap.*,
          ct.key as content_type,
          ct.label as content_type_label,
          ct.icon as content_type_icon
        FROM ${this.tableName} ap
        JOIN content_types ct ON ap.content_type_id = ct.id
        ${options.includeInactive !== true ? 'WHERE ap.is_active = true AND ct.is_active = true' : ''}
        ORDER BY ap.created_at DESC
      `;
      
      const result = await database.query(query);
      
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error('Error getting system prompts:', error);
      throw error;
    }
  }

  /**
   * Get available AI providers
   * @returns {Promise<Array>} Array of unique AI providers
   */
  async getAvailableProviders() {
    try {
      const query = `
        SELECT DISTINCT ai_provider 
        FROM ${this.tableName} 
        WHERE is_active = true 
        ORDER BY ai_provider
      `;
      
      const result = await database.query(query);
      
      return result.rows.map(row => row.ai_provider);
    } catch (error) {
      logger.error('Error getting available AI providers:', error);
      throw error;
    }
  }

  /**
   * Get available content types (now uses content_types table via relationship)
   * @returns {Promise<Array>} Array of unique content types with their labels and icons
   */
  async getAvailableContentTypes() {
    try {
      const query = `
        SELECT DISTINCT ct.key as type, ct.label, ct.icon, ct.display_order
        FROM ${this.tableName} ap
        JOIN content_types ct ON ap.content_type_id = ct.id
        WHERE ap.is_active = true AND ct.is_active = true
        ORDER BY ct.display_order ASC, ct.key ASC
      `;
      
      const result = await database.query(query);
      
      return result.rows;
    } catch (error) {
      logger.error('Error getting available content types:', error);
      throw error;
    }
  }

  /**
   * Get provider counts grouped by content type
   * @returns {Promise<Array>} Array of content types with provider counts and lists
   */
  async getProviderCountsByContentType() {
    try {
      const query = `
        SELECT ct.key as content_type, COUNT(*) as provider_count, ARRAY_AGG(DISTINCT ap.ai_provider) as providers
        FROM ${this.tableName} ap
        JOIN content_types ct ON ap.content_type_id = ct.id
        WHERE ap.is_active = true AND ct.is_active = true
        GROUP BY ct.key, ct.display_order
        ORDER BY ct.display_order ASC, ct.key ASC
      `;
      
      const result = await database.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting provider counts by content type:', error);
      throw error;
    }
  }

  /**
   * Toggle prompt active status
   * @param {number} promptId - Prompt ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<object>} Updated prompt
   */
  async toggleActive(promptId, isActive) {
    try {
      return await this.update(promptId, { is_active: isActive });
    } catch (error) {
      logger.error(`Error toggling prompt ${promptId} active status:`, error);
      throw error;
    }
  }

  /**
   * Update display order for prompt (deprecated - display_order column removed)
   * @param {number} promptId - Prompt ID
   * @param {number} displayOrder - New display order (ignored)
   * @returns {Promise<object>} Updated prompt
   */
  async updateDisplayOrder(promptId, displayOrder) {
    try {
      logger.warn(`updateDisplayOrder called but display_order column no longer exists. Prompt ID: ${promptId}`);
      // Return the prompt without modification since display_order no longer exists
      return await this.findById(promptId);
    } catch (error) {
      logger.error(`Error in updateDisplayOrder for prompt ${promptId}:`, error);
      throw error;
    }
  }

  /**
   * Duplicate a prompt (useful for creating user versions of system prompts)
   * @param {number} sourcePromptId - Source prompt ID to duplicate
   * @param {object} overrides - Fields to override in the duplicate
   * @returns {Promise<object>} Created duplicate prompt
   */
  async duplicatePrompt(sourcePromptId, overrides = {}) {
    try {
      const sourcePrompt = await this.findById(sourcePromptId);
      if (!sourcePrompt) {
        throw new Error(`Source prompt ${sourcePromptId} not found`);
      }

      // Create duplicate with overrides
      const duplicateData = {
        name: sourcePrompt.name + ' (Copy)',
        description: sourcePrompt.description,
        ai_provider: sourcePrompt.ai_provider,
        content_type_id: sourcePrompt.content_type_id,
        prompt_text: sourcePrompt.prompt_text,
        system_message: sourcePrompt.system_message,
        temperature: sourcePrompt.temperature,
        max_tokens: sourcePrompt.max_tokens,
        is_active: true,
        ...overrides
      };

      return await this.createPrompt(duplicateData);
    } catch (error) {
      logger.error(`Error duplicating prompt ${sourcePromptId}:`, error);
      throw error;
    }
  }

  /**
   * Search prompts by name or description
   * @param {string} searchTerm - Search term
   * @param {object} options - Search options
   * @returns {Promise<Array>} Array of matching prompts
   */
  async searchPrompts(searchTerm, options = {}) {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE (
          name ILIKE $1 
          OR description ILIKE $1
          OR prompt_text ILIKE $1
        )
        
        ${options.includeInactive !== true ? 'AND is_active = true' : ''}
        ORDER BY 
          CASE WHEN name ILIKE $1 THEN 1 ELSE 2 END,
          created_at DESC
        ${options.limit ? `LIMIT ${parseInt(options.limit)}` : ''}
      `;
      
      const searchPattern = `%${searchTerm}%`;
      const params = [searchPattern];
      
      const result = await database.query(query, params);
      
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error searching prompts with term "${searchTerm}":`, error);
      throw error;
    }
  }

  /**
   * Get prompt statistics
   * @returns {Promise<object>} Statistics object
   */
  async getPromptStats() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_prompts,
          COUNT(*) FILTER (WHERE is_active = true) as active_prompts,
          COUNT(*) as system_prompts,
          0 as user_prompts,
          COUNT(DISTINCT ai_provider) as unique_providers,
          COUNT(DISTINCT content_type_id) as unique_content_types
        FROM ${this.tableName}
      `;
      
      const result = await database.query(query);
      
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting prompt statistics:', error);
      throw error;
    }
  }

  /**
   * Get prompts statistics for admin dashboard
   * @returns {Promise<object>} Statistics object
   */
  async getPromptsStatistics() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(DISTINCT ai_provider) as providers
        FROM ${this.tableName}
      `;
      
      const result = await database.query(query);
      
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting prompts statistics:', error);
      throw error;
    }
  }

  /**
   * Get all prompts grouped by content type
   * @returns {Promise<Array>} Array of prompts with content type info
   */
  async getAllGroupedByContentType() {
    try {
      const query = `
        SELECT 
          ap.*,
          ct.key as content_type_key,
          ct.label as content_type_label
        FROM ${this.tableName} ap
        LEFT JOIN content_types ct ON ap.content_type_id = ct.id
        ORDER BY ct.display_order ASC, ap.ai_provider ASC, ap.name ASC
      `;
      
      const result = await database.query(query);
      
      return result.rows;
    } catch (error) {
      logger.error('Error getting prompts grouped by content type:', error);
      throw error;
    }
  }

  /**
   * Validate prompt data
   * @param {object} promptData - Data to validate
   * @param {boolean} isCreate - Whether this is for creation (requires all fields)
   * @throws {Error} Validation error
   */
  validatePromptData(promptData, isCreate = true) {
    const requiredFields = ['ai_provider', 'content_type_id', 'prompt_text'];
    const validProviders = ['openai', 'google', 'claude', 'gemini', 'chatgpt'];
    
    if (isCreate) {
      // Check required fields for creation
      for (const field of requiredFields) {
        if (!promptData[field]) {
          throw new Error(`${field} is required`);
        }
      }
      
      if (!promptData.name) {
        throw new Error('name is required');
      }
    }
    
    // Validate AI provider
    if (promptData.ai_provider && !validProviders.includes(promptData.ai_provider.toLowerCase())) {
      throw new Error(`Invalid AI provider. Must be one of: ${validProviders.join(', ')}`);
    }
    
    // Validate temperature
    if (promptData.temperature !== undefined) {
      const temp = parseFloat(promptData.temperature);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        throw new Error('Temperature must be a number between 0 and 2');
      }
    }
    
    // Validate max_tokens
    if (promptData.max_tokens !== undefined) {
      const tokens = parseInt(promptData.max_tokens);
      if (isNaN(tokens) || tokens < 1 || tokens > 100000) {
        throw new Error('Max tokens must be a number between 1 and 100000');
      }
    }
    
    // Note: display_order validation removed since column no longer exists
  }
}

module.exports = AiPrompts;