const database = require('../services/database.service');
const { logger } = require('../utils');

/**
 * Base Model Class
 * Provides common CRUD operations and database interactions
 * All models should extend this class
 */
class BaseModel {
  constructor(tableName, primaryKey = 'id') {
    this.tableName = tableName;
    this.primaryKey = primaryKey;
    this.fillable = []; // Fields that can be mass-assigned
    this.hidden = []; // Fields to hide in JSON output
    this.casts = {}; // Type casting for fields
    this.validationRules = {}; // Validation rules
  }

  /**
   * Find record by primary key
   * @param {*} id - Primary key value
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
      const result = await database.query(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding ${this.tableName} by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Find records by field value
   * @param {string} field - Field name
   * @param {*} value - Field value
   * @returns {Promise<Array>}
   */
  async findByField(field, value) {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE ${field} = $1`;
      const result = await database.query(query, [value]);

      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error finding ${this.tableName} by ${field}:`, error);
      throw error;
    }
  }

  /**
   * Find all records with optional conditions
   * @param {object} conditions - WHERE conditions
   * @param {object} options - Query options (limit, offset, orderBy)
   * @returns {Promise<Array>}
   */
  async findAll(conditions = {}, options = {}) {
    try {
      let query = `SELECT * FROM ${this.tableName}`;
      const queryParams = [];
      let paramIndex = 1;

      // Build WHERE clause
      if (Object.keys(conditions).length > 0) {
        const whereConditions = [];
        Object.entries(conditions).forEach(([field, value]) => {
          if (value !== null && value !== undefined) {
            whereConditions.push(`${field} = $${paramIndex}`);
            queryParams.push(value);
            paramIndex++;
          }
        });

        if (whereConditions.length > 0) {
          query += ` WHERE ${whereConditions.join(' AND ')}`;
        }
      }

      // Add ORDER BY
      if (options.orderBy) {
        query += ` ORDER BY ${options.orderBy}`;
      }

      // Add LIMIT and OFFSET
      if (options.limit) {
        query += ` LIMIT $${paramIndex}`;
        queryParams.push(options.limit);
        paramIndex++;
      }

      if (options.offset) {
        query += ` OFFSET $${paramIndex}`;
        queryParams.push(options.offset);
        paramIndex++;
      }

      const result = await database.query(query, queryParams);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error finding all ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Create new record
   * @param {object} data - Record data
   * @returns {Promise<object>}
   */
  async create(data) {
    try {
      // Validate data
      this.validate(data);

      // Filter fillable fields
      const filteredData = this.filterFillable(data);

      // Cast data types
      const castedData = this.castData(filteredData);

      // Prepare query
      const fields = Object.keys(castedData);
      const values = Object.values(castedData);
      const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');

      const query = `
        INSERT INTO ${this.tableName} (${fields.join(', ')}) 
        VALUES (${placeholders}) 
        RETURNING *
      `;

      const result = await database.query(query, values);
      const created = this.formatOutput(result.rows[0]);

      logger.info(`Created ${this.tableName} record with ID: ${created[this.primaryKey]}`);
      return created;
    } catch (error) {
      logger.error(`Error creating ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Update record by ID
   * @param {*} id - Primary key value
   * @param {object} data - Update data
   * @returns {Promise<object|null>}
   */
  async update(id, data) {
    try {
      // Validate data
      this.validate(data, true);

      // Filter fillable fields
      const filteredData = this.filterFillable(data);

      if (Object.keys(filteredData).length === 0) {
        throw new Error('No valid fields to update');
      }

      // Cast data types
      const castedData = this.castData(filteredData);

      // Add updated_at if it exists
      if (await this.hasField('updated_at')) {
        castedData.updated_at = new Date();
      }

      // Prepare query
      const fields = Object.keys(castedData);
      const values = Object.values(castedData);
      const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

      values.push(id);
      const query = `
        UPDATE ${this.tableName} 
        SET ${setClause} 
        WHERE ${this.primaryKey} = $${values.length}
        RETURNING *
      `;

      const result = await database.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      const updated = this.formatOutput(result.rows[0]);
      logger.info(`Updated ${this.tableName} record ID: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error updating ${this.tableName} ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete record by ID
   * @param {*} id - Primary key value
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    try {
      const query = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
      const result = await database.query(query, [id]);

      const deleted = result.rowCount > 0;
      if (deleted) {
        logger.info(`Deleted ${this.tableName} record ID: ${id}`);
      }

      return deleted;
    } catch (error) {
      logger.error(`Error deleting ${this.tableName} ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * Count records with optional conditions
   * @param {object} conditions - WHERE conditions
   * @returns {Promise<number>}
   */
  async count(conditions = {}) {
    try {
      let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
      const queryParams = [];
      let paramIndex = 1;

      if (Object.keys(conditions).length > 0) {
        const whereConditions = [];
        Object.entries(conditions).forEach(([field, value]) => {
          if (value !== null && value !== undefined) {
            whereConditions.push(`${field} = $${paramIndex}`);
            queryParams.push(value);
            paramIndex++;
          }
        });

        if (whereConditions.length > 0) {
          query += ` WHERE ${whereConditions.join(' AND ')}`;
        }
      }

      const result = await database.query(query, queryParams);
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error(`Error counting ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Execute raw query (for complex operations)
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<object>}
   */
  async query(query, params = []) {
    try {
      return await database.query(query, params);
    } catch (error) {
      logger.error(`Error executing query on ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Filter data to only include fillable fields
   * @param {object} data - Input data
   * @returns {object}
   */
  filterFillable(data) {
    if (this.fillable.length === 0) {
      return data; // If no fillable specified, allow all fields
    }

    const filtered = {};
    this.fillable.forEach(field => {
      if (data.hasOwnProperty(field)) {
        filtered[field] = data[field];
      }
    });

    return filtered;
  }

  /**
   * Cast data according to model rules
   * @param {object} data - Input data
   * @returns {object}
   */
  castData(data) {
    const casted = { ...data };

    Object.entries(this.casts).forEach(([field, type]) => {
      if (casted.hasOwnProperty(field) && casted[field] !== null) {
        switch (type) {
          case 'integer':
            casted[field] = parseInt(casted[field]);
            break;
          case 'float':
            casted[field] = parseFloat(casted[field]);
            break;
          case 'boolean':
            casted[field] = Boolean(casted[field]);
            break;
          case 'date':
            casted[field] = new Date(casted[field]);
            break;
          case 'json':
            if (typeof casted[field] === 'string') {
              casted[field] = JSON.parse(casted[field]);
            }
            break;
        }
      }
    });

    return casted;
  }

  /**
   * Format output by hiding sensitive fields
   * @param {object} data - Raw data
   * @returns {object}
   */
  formatOutput(data) {
    if (this.hidden.length === 0) {
      return data;
    }

    const output = { ...data };
    this.hidden.forEach(field => {
      delete output[field];
    });

    return output;
  }

  /**
   * Basic validation (can be overridden)
   * @param {object} data - Data to validate
   * @param {boolean} isUpdate - Whether this is an update operation
   */
  validate(data, isUpdate = false) {
    // Basic validation - can be overridden in child classes
    // For now, just check required fields on create
    if (!isUpdate && this.validationRules.required) {
      this.validationRules.required.forEach(field => {
        if (!data.hasOwnProperty(field) || data[field] === null || data[field] === undefined) {
          throw new Error(`Field '${field}' is required`);
        }
      });
    }
  }

  /**
   * Check if table has a specific field
   * @param {string} fieldName - Field name to check
   * @returns {Promise<boolean>}
   */
  async hasField(fieldName) {
    try {
      const query = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = $2
      `;
      const result = await database.query(query, [this.tableName, fieldName]);
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find records with advanced filtering, search, and pagination
   * @param {object} conditions - Simple field = value conditions
   * @param {object} options - Query options
   * @param {number} options.page - Page number (1-based)
   * @param {number} options.limit - Records per page
   * @param {string} options.orderBy - Order by clause
   * @param {Array} options.searchFields - Fields to search in
   * @param {string} options.searchTerm - Search term for text search
   * @param {boolean} options.caseInsensitive - Case insensitive search
   * @returns {Promise<object>} Results with pagination info
   */
  async findAllWithPagination(conditions = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        orderBy = `${this.primaryKey} DESC`,
        searchFields = [],
        searchTerm = '',
        caseInsensitive = true
      } = options;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      // Build WHERE conditions
      const whereConditions = [];
      const queryParams = [];
      let paramIndex = 1;

      // Add simple field conditions
      Object.entries(conditions).forEach(([field, value]) => {
        if (value !== undefined && value !== null) {
          whereConditions.push(`${field} = $${paramIndex}`);
          queryParams.push(value);
          paramIndex++;
        }
      });

      // Add search conditions
      if (searchTerm && searchTerm.trim() && searchFields.length > 0) {
        const searchConditions = searchFields.map(field => {
          if (caseInsensitive) {
            const condition = `LOWER(${field}) LIKE LOWER($${paramIndex})`;
            return condition;
          } else {
            const condition = `${field} LIKE $${paramIndex}`;
            return condition;
          }
        });

        if (searchConditions.length > 0) {
          whereConditions.push(`(${searchConditions.join(' OR ')})`);
          // Add the same search parameter for each field
          for (let i = 0; i < searchFields.length; i++) {
            queryParams.push(`%${searchTerm.trim()}%`);
            paramIndex++;
          }
        }
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get total count for pagination
      const countQuery = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
      const countResult = await database.query(countQuery, queryParams);
      const totalRecords = parseInt(countResult.rows[0].total);

      // Build main query with pagination and sorting
      const mainQuery = `
        SELECT * FROM ${this.tableName} 
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      queryParams.push(limitNum, offset);

      const result = await database.query(mainQuery, queryParams);
      const records = result.rows.map(row => this.formatOutput(row));

      return {
        data: records,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalRecords / limitNum),
          totalRecords: totalRecords,
          startIndex: Math.min(offset + 1, totalRecords),
          endIndex: Math.min(offset + records.length, totalRecords),
          hasMore: offset + limitNum < totalRecords,
          limit: limitNum
        }
      };
    } catch (error) {
      logger.error(`Error in findAllWithPagination for ${this.tableName}:`, error);
      throw error;
    }
  }
}

module.exports = BaseModel;
