require('dotenv').config();
const { Pool } = require('pg');
const { logger } = require('../utils');

class DatabaseService {
  constructor() {
    this.pool = null;
    this.init();
  }

  init() {
    try {
      if (!process.env.DATABASE_URL) {
        logger.warn('PostgreSQL DATABASE_URL not configured. Database features will be disabled.');
        return;
      }

      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 10, // Maximum connections in pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      this.pool.on('connect', () => {
        logger.info('Connected to PostgreSQL database');
      });

      this.pool.on('error', (err) => {
        logger.error('PostgreSQL pool error:', err);
      });

      logger.info('PostgreSQL service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PostgreSQL service:', error);
      throw error;
    }
  }

  /**
   * Execute a query with parameters
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async query(text, params = []) {
    if (!this.pool) {
      throw new Error('PostgreSQL not configured');
    }

    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      // Only log slow queries or in debug mode
      if (duration > 500) {
        logger.warn(`Slow query executed in ${duration}ms`, { sql: text.substring(0, 100) + '...' });
      }
      return result;
    } catch (error) {
      logger.error('Database query error:', {
        error: error.message,
        code: error.code,
        detail: error.detail,
        constraint: error.constraint,
        sql: text,
        params
      });
      throw error;
    }
  }

  /**
   * Find records by field value (similar to Airtable.findByField)
   * @param {string} tableName - Table name
   * @param {string} fieldName - Field name to search
   * @param {any} fieldValue - Field value to match
   * @returns {Promise<Array>} Matching records
   */
  async findByField(tableName, fieldName, fieldValue) {
    try {
      const query = `SELECT * FROM ${tableName.toLowerCase()} WHERE ${fieldName} = $1`;
      const result = await this.query(query, [fieldValue]);

      // Only log if no results found (potential issue) or many results (performance concern)
      if (result.rows.length === 0) {
        logger.debug(`No records found in ${tableName} where ${fieldName} = ${fieldValue}`);
      } else if (result.rows.length > 10) {
        logger.debug(`Found ${result.rows.length} records in ${tableName} where ${fieldName} = ${fieldValue}`);
      }

      return this.formatRecords(result.rows);
    } catch (error) {
      logger.error(`Error finding records in ${tableName}:`, error);
      throw new Error(`Failed to find records in ${tableName}: ${error.message}`);
    }
  }

  /**
   * Find record by ID
   * @param {string} tableName - Table name
   * @param {string} recordId - Record ID
   * @returns {Promise<Object|null>} Record or null if not found
   */
  async findById(tableName, recordId) {
    try {
      const query = `SELECT * FROM ${tableName.toLowerCase()} WHERE id = $1`;
      const result = await this.query(query, [recordId]);

      if (result.rows.length === 0) {
        logger.debug(`Record not found in ${tableName} with ID: ${recordId}`);
        return null;
      }

      return this.formatRecord(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding record in ${tableName}:`, error);
      throw new Error(`Failed to find record in ${tableName}: ${error.message}`);
    }
  }

  /**
   * Find all records in a table
   * @param {string} tableName - Table name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} All records
   */
  async findAll(tableName, options = {}) {
    try {
      const { maxRecords = 100, sort = [], filterByFormula = null } = options;

      logger.info(`Finding all records in ${tableName}`, options);

      let query = `SELECT * FROM ${tableName.toLowerCase()}`;
      const params = [];

      // Add WHERE clause if filter is provided
      if (filterByFormula) {
        // This is a simplified version - you'd need to parse Airtable formulas
        // For now, we'll skip complex filtering
        logger.warn('Complex filtering not yet implemented in PostgreSQL service');
      }

      // Add ORDER BY if sort is specified
      if (sort.length > 0) {
        const sortClauses = sort.map(s => `${s.field} ${s.direction.toUpperCase()}`);
        query += ` ORDER BY ${sortClauses.join(', ')}`;
      }

      // Add LIMIT
      query += ` LIMIT $${params.length + 1}`;
      params.push(maxRecords);

      const result = await this.query(query, params);

      logger.info(`Found ${result.rows.length} records in ${tableName}`);
      return this.formatRecords(result.rows);
    } catch (error) {
      logger.error(`Error finding all records in ${tableName}:`, error);
      throw new Error(`Failed to find records in ${tableName}: ${error.message}`);
    }
  }

  /**
   * Create a new record
   * @param {string} tableName - Table name
   * @param {Object} fields - Record fields
   * @returns {Promise<Object>} Created record
   */
  async create(tableName, fields) {
    try {
      logger.debug(`Creating record in ${tableName}`);

      const fieldNames = Object.keys(fields);
      const values = Object.values(fields);
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

      const query = `
        INSERT INTO ${tableName.toLowerCase()} (${fieldNames.join(', ')}) 
        VALUES (${placeholders}) 
        RETURNING *
      `;

      const result = await this.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Failed to create record');
      }

      logger.debug(`Record created in ${tableName} with ID ${result.rows[0].id}`);
      return this.formatRecord(result.rows[0]);
    } catch (error) {
      logger.error(`Error creating record in ${tableName}:`, error);
      throw new Error(`Failed to create record in ${tableName}: ${error.message}`);
    }
  }

  /**
   * Update a record
   * @param {string} tableName - Table name
   * @param {string} recordId - Record ID
   * @param {Object} fields - Fields to update
   * @returns {Promise<Object>} Updated record
   */
  async update(tableName, recordId, fields) {
    try {
      logger.debug(`Updating record in ${tableName} with ID ${recordId}`);

      const fieldNames = Object.keys(fields);
      const values = Object.values(fields);
      const setClauses = fieldNames.map((field, index) => `${field} = $${index + 1}`);

      // Only add updated_at if it's not already in the fields
      const hasUpdatedAt = fieldNames.some(field => field.toLowerCase() === 'updated_at');
      const setClause = hasUpdatedAt
        ? setClauses.join(', ')
        : `${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP`;

      const query = `
        UPDATE ${tableName.toLowerCase()} 
        SET ${setClause}
        WHERE id = $${values.length + 1} 
        RETURNING *
      `;

      const result = await this.query(query, [...values, recordId]);

      if (result.rows.length === 0) {
        throw new Error('Record not found or failed to update');
      }

      logger.debug(`Record updated in ${tableName}`);
      return this.formatRecord(result.rows[0]);
    } catch (error) {
      logger.error(`Error updating record in ${tableName}:`, error);
      throw new Error(`Failed to update record in ${tableName}: ${error.message}`);
    }
  }

  /**
   * Delete a record
   * @param {string} tableName - Table name
   * @param {string} recordId - Record ID
   * @returns {Promise<Object>} Deleted record info
   */
  async delete(tableName, recordId) {
    try {
      logger.info(`Deleting record in ${tableName} with ID: ${recordId}`);

      const query = `DELETE FROM ${tableName.toLowerCase()} WHERE id = $1 RETURNING *`;
      const result = await this.query(query, [recordId]);

      if (result.rows.length === 0) {
        throw new Error('Record not found');
      }

      logger.info(`Record deleted successfully in ${tableName}`, { id: recordId });
      return this.formatRecord(result.rows[0]);
    } catch (error) {
      logger.error(`Error deleting record in ${tableName}:`, error);
      throw new Error(`Failed to delete record in ${tableName}: ${error.message}`);
    }
  }

  /**
   * Find records by multiple field conditions
   * @param {string} tableName - Table name
   * @param {Object} fieldConditions - Field conditions
   * @returns {Promise<Array>} Matching records
   */
  async findByMultipleFields(tableName, fieldConditions) {
    try {
      logger.info(`Finding records in ${tableName} with conditions:`, fieldConditions);

      const conditions = Object.entries(fieldConditions)
        .filter(([_key, value]) => value !== null && value !== undefined);

      if (conditions.length === 0) {
        logger.warn('No valid conditions provided for findByMultipleFields');
        return [];
      }

      const whereClauses = conditions.map(([field, _value], index) => `${field} = $${index + 1}`);
      const values = conditions.map(([_field, value]) => value);

      const query = `
        SELECT * FROM ${tableName.toLowerCase()} 
        WHERE ${whereClauses.join(' AND ')}
      `;

      const result = await this.query(query, values);

      logger.info(`Found ${result.rows.length} records in ${tableName} matching conditions`);
      return this.formatRecords(result.rows);
    } catch (error) {
      logger.error(`Error finding records by multiple fields in ${tableName}:`, error);
      throw new Error(`Failed to find records in ${tableName}: ${error.message}`);
    }
  }

  /**
   * Create multiple records
   * @param {string} tableName - Table name
   * @param {Array} recordsData - Array of record objects
   * @returns {Promise<Array>} Created records
   */
  async createMultiple(tableName, recordsData) {
    try {
      logger.info(`Creating ${recordsData.length} records in ${tableName}`);

      const client = await this.pool.connect();

      try {
        await client.query('BEGIN');

        const results = [];
        for (const record of recordsData) {
          const fieldNames = Object.keys(record.fields);
          const values = Object.values(record.fields);
          const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

          const query = `
            INSERT INTO ${tableName.toLowerCase()} (${fieldNames.join(', ')}) 
            VALUES (${placeholders}) 
            RETURNING *
          `;

          const result = await client.query(query, values);
          results.push(this.formatRecord(result.rows[0]));
        }

        await client.query('COMMIT');

        logger.info(`${results.length} records created successfully in ${tableName}`);
        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error(`Error creating multiple records in ${tableName}:`, error);
      throw new Error(`Failed to create records in ${tableName}: ${error.message}`);
    }
  }

  /**
   * Check if a record exists with given conditions
   * @param {string} tableName - Table name
   * @param {Object} fieldConditions - Field conditions
   * @returns {Promise<Object|null>} First matching record or null
   */
  async findDuplicate(tableName, fieldConditions) {
    try {
      const records = await this.findByMultipleFields(tableName, fieldConditions);
      return records.length > 0 ? records[0] : null;
    } catch (error) {
      logger.error(`Error checking for duplicate in ${tableName}:`, error);
      return null;
    }
  }

  /**
   * Get table schema (simplified version)
   * @param {string} tableName - Table name
   * @returns {Promise<Object>} Table schema info
   */
  async getTableSchema(tableName) {
    try {
      const query = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `;

      const result = await this.query(query, [tableName.toLowerCase()]);

      return {
        tableName,
        fields: result.rows.map(row => row.column_name),
        columns: result.rows
      };
    } catch (error) {
      logger.error(`Error getting schema for ${tableName}:`, error);
      throw new Error(`Failed to get schema for ${tableName}: ${error.message}`);
    }
  }

  /**
   * Format a single record for PostgreSQL (return raw row data)
   * @param {Object} row - Database row
   * @returns {Object} Formatted record
   */
  formatRecord(row) {
    // For PostgreSQL, return the raw row data with proper field names
    if (!row) {
      return null;
    }

    // Return raw PostgreSQL row data
    return { ...row };
  }

  /**
   * Format multiple records
   * @param {Array} rows - Database rows
   * @returns {Array} Formatted records
   */
  formatRecords(rows) {
    return rows.map(row => this.formatRecord(row));
  }

  /**
   * Close database connections
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      logger.info('PostgreSQL connections closed');
    }
  }
}

module.exports = new DatabaseService();
