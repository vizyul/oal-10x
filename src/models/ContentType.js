const BaseModel = require('./BaseModel');

/**
 * ContentType Model
 * Manages content type definitions with icons and metadata
 */
class ContentType extends BaseModel {
  constructor() {
    super('content_types');
    
    // Define fillable fields (mass assignable)
    this.fillable = [
      'key',
      'label', 
      'icon',
      'description',
      'display_order',
      'requires_ai',
      'has_url_field',
      'is_active'
    ];
    
    // Fields to hide from JSON output
    this.hidden = [];
    
    // Type casting rules
    this.casts = {
      display_order: 'integer',
      requires_ai: 'boolean',
      has_url_field: 'boolean', 
      is_active: 'boolean'
    };
    
    // Validation rules
    this.validationRules = {
      required: ['key', 'label'],
      unique: ['key']
    };
  }

  /**
   * Find content type by key
   * @param {string} key - Content type key
   * @returns {Promise<object|null>}
   */
  async findByKey(key) {
    const results = await this.findByField('key', key);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get all active content types ordered by display order
   * @returns {Promise<Array>}
   */
  async getActive() {
    return await this.findAll(
      { is_active: true }, 
      { orderBy: 'display_order ASC, key ASC' }
    );
  }

  /**
   * Get content types that require AI generation
   * @returns {Promise<Array>}
   */
  async getAiRequired() {
    return await this.findAll(
      { is_active: true, requires_ai: true },
      { orderBy: 'display_order ASC' }
    );
  }

  /**
   * Get content types that support URL fields
   * @returns {Promise<Array>}
   */
  async getWithUrlSupport() {
    return await this.findAll(
      { is_active: true, has_url_field: true },
      { orderBy: 'display_order ASC' }
    );
  }

  /**
   * Update display order for multiple content types
   * @param {Array} orderUpdates - Array of {id, display_order} objects
   * @returns {Promise<Array>}
   */
  async updateDisplayOrder(orderUpdates) {
    try {
      const updated = [];
      
      for (const update of orderUpdates) {
        const result = await this.update(update.id, { 
          display_order: update.display_order 
        });
        if (result) {
          updated.push(result);
        }
      }
      
      return updated;
    } catch (error) {
      throw new Error(`Failed to update display order: ${error.message}`);
    }
  }

  /**
   * Get content type statistics (usage across videos)
   * @returns {Promise<Array>}
   */
  async getUsageStatistics() {
    try {
      const query = `
        SELECT 
          ct.id,
          ct.key,
          ct.label,
          ct.icon,
          COUNT(vc.id) as usage_count,
          COUNT(DISTINCT vc.video_id) as video_count,
          AVG(vc.content_quality_score) as avg_quality,
          MAX(vc.created_at) as last_used
        FROM content_types ct
        LEFT JOIN video_content vc ON ct.id = vc.content_type_id
        WHERE ct.is_active = true
        GROUP BY ct.id, ct.key, ct.label, ct.icon, ct.display_order
        ORDER BY ct.display_order ASC
      `;
      
      const result = await this.query(query);
      return result.rows.map(row => ({
        ...row,
        usage_count: parseInt(row.usage_count),
        video_count: parseInt(row.video_count),
        avg_quality: row.avg_quality ? parseFloat(row.avg_quality) : null,
        last_used: row.last_used
      }));
    } catch (error) {
      throw new Error(`Failed to get usage statistics: ${error.message}`);
    }
  }

  /**
   * Enhanced validation with business rules
   * @param {object} data - Data to validate
   * @param {boolean} isUpdate - Whether this is an update
   */
  validate(data, isUpdate = false) {
    super.validate(data, isUpdate);
    
    // Key format validation
    if (data.key) {
      if (!/^[a-z_]+$/.test(data.key)) {
        throw new Error('Content type key must contain only lowercase letters and underscores');
      }
      
      if (!data.key.endsWith('_text')) {
        throw new Error('Content type key must end with "_text"');
      }
    }
    
    // Display order validation
    if (data.display_order !== undefined) {
      const order = parseInt(data.display_order);
      if (isNaN(order) || order < 0) {
        throw new Error('Display order must be a positive integer');
      }
    }
    
    // Icon validation (basic emoji check)
    if (data.icon) {
      if (data.icon.length > 10) {
        throw new Error('Icon must be 10 characters or less');
      }
    }
    
    // Label validation
    if (data.label) {
      if (data.label.length < 2 || data.label.length > 100) {
        throw new Error('Label must be between 2 and 100 characters');
      }
    }
  }

  /**
   * Create content type with auto-generated display order
   * @param {object} data - Content type data
   * @returns {Promise<object>}
   */
  async createWithOrder(data) {
    try {
      // If no display order specified, set to max + 1
      if (!data.display_order) {
        const maxOrderQuery = 'SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM content_types';
        const result = await this.query(maxOrderQuery);
        data.display_order = result.rows[0].next_order;
      }
      
      // Set defaults
      data.is_active = data.is_active !== undefined ? data.is_active : true;
      data.requires_ai = data.requires_ai !== undefined ? data.requires_ai : true;
      data.has_url_field = data.has_url_field !== undefined ? data.has_url_field : true;
      
      return await this.create(data);
    } catch (error) {
      throw new Error(`Failed to create content type: ${error.message}`);
    }
  }

  /**
   * Soft delete content type (mark as inactive)
   * @param {number} id - Content type ID
   * @returns {Promise<object|null>}
   */
  async softDelete(id) {
    try {
      return await this.update(id, { is_active: false });
    } catch (error) {
      throw new Error(`Failed to deactivate content type: ${error.message}`);
    }
  }

  /**
   * Check if content type is in use
   * @param {number} id - Content type ID
   * @returns {Promise<boolean>}
   */
  async isInUse(id) {
    try {
      const query = 'SELECT COUNT(*) as count FROM video_content WHERE content_type_id = $1';
      const result = await this.query(query, [id]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get content type with related AI prompts
   * @param {number} id - Content type ID
   * @returns {Promise<object|null>}
   */
  async getWithPrompts(id) {
    try {
      const query = `
        SELECT 
          ct.*,
          json_agg(
            json_build_object(
              'id', ap.id,
              'ai_provider', ap.ai_provider,
              'name', ap.name,
              'is_active', ap.is_active
            )
          ) FILTER (WHERE ap.id IS NOT NULL) as ai_prompts
        FROM content_types ct
        LEFT JOIN ai_prompts ap ON ap.content_type = ct.key AND ap.is_active = true
        WHERE ct.id = $1
        GROUP BY ct.id
      `;
      
      const result = await this.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const contentType = this.formatOutput(result.rows[0]);
      contentType.ai_prompts = contentType.ai_prompts || [];
      
      return contentType;
    } catch (error) {
      throw new Error(`Failed to get content type with prompts: ${error.message}`);
    }
  }
}

module.exports = ContentType;