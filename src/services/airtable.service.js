require('dotenv').config();
const Airtable = require('airtable');
const { logger } = require('../utils');

class AirtableService {
  constructor() {
    this.base = null;
    this.init();
  }

  init() {
    try {
      if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
        logger.warn('Airtable API key or base ID not configured. Some features may not work.');
        return;
      }

      Airtable.configure({
        apiKey: process.env.AIRTABLE_API_KEY
      });

      this.base = Airtable.base(process.env.AIRTABLE_BASE_ID);
      logger.info('Airtable service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Airtable service:', error);
      throw error;
    }
  }

  /**
   * Create a new record in Airtable
   * @param {string} tableName - Name of the table
   * @param {Object} fields - Record fields
   * @returns {Promise<Object>} Created record
   */
  async create(tableName, fields) {
    try {
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      logger.info(`Creating record in ${tableName}`, { fields });

      const records = await this.base(tableName).create([
        { fields }
      ]);

      if (records.length === 0) {
        throw new Error('Failed to create record');
      }

      logger.info(`Record created successfully in ${tableName}`, { id: records[0].id });
      return records[0];
    } catch (error) {
      logger.error(`Error creating record in ${tableName}:`, error);
      throw new Error(`Failed to create record in ${tableName}`);
    }
  }

  /**
   * Find records by field value
   * @param {string} tableName - Name of the table
   * @param {string} fieldName - Field name to search
   * @param {any} fieldValue - Field value to match
   * @returns {Promise<Array>} Matching records
   */
  async findByField(tableName, fieldName, fieldValue) {
    try {
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      // Finding records in Airtable

      // Use firstPage() with optimized query - limit to 1 for findUserByEmail since we only need one
      const isEmailLookup = fieldName === 'Email';
      
      // Handle different field types
      let filterFormula;
      if (isEmailLookup) {
        // Case-insensitive email comparison
        filterFormula = `LOWER({${fieldName}}) = LOWER("${fieldValue}")`;
      } else if (fieldName === 'user_id') {
        // Handle linked field arrays - check if the record ID is in the array
        filterFormula = `FIND("${fieldValue}", ARRAYJOIN({${fieldName}})) > 0`;
      } else {
        // Standard equality check
        filterFormula = `{${fieldName}} = "${fieldValue}"`;
      }
      
      const selectOptions = {
        filterByFormula: filterFormula,
        maxRecords: isEmailLookup ? 1 : 10 // Only get 1 record for email lookups
      };
      
      // Only add fields parameter for email lookups
      if (isEmailLookup) {
        selectOptions.fields = ['Email', 'Password', 'First Name', 'Last Name', 'Email Verified', 'Email Verification Token', 'Email Verification Expires', 'Status', 'Created At', 'Updated At', 'Last Login At', 'Terms Accepted', 'Privacy Accepted', 'Registration Method', 'Google ID', 'Microsoft ID', 'Apple ID', 'Welcome Email Sent', 'Welcome Email Sent At', 'subscription_tier', 'subscription_status', 'stripe_customer_id'];
      }
      
      const records = await this.base(tableName).select(selectOptions).firstPage();

      logger.info(`Found ${records.length} records in ${tableName}`);
      return records;
    } catch (error) {
      logger.error(`Error finding records in ${tableName}:`, error.message || error);
      if (error.statusCode === 404 || error.message?.includes('NOT_FOUND')) {
        logger.error(`Table "${tableName}" does not exist in Airtable base`);
        throw new Error(`Table "${tableName}" does not exist in Airtable base`);
      }
      throw new Error(`Failed to find records in ${tableName}: ${error.message}`);
    }
  }

  /**
   * Find record by ID
   * @param {string} tableName - Name of the table
   * @param {string} recordId - Record ID
   * @returns {Promise<Object|null>} Record or null if not found
   */
  async findById(tableName, recordId) {
    try {
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      logger.info(`Finding record in ${tableName} with ID: ${recordId}`);

      const record = await this.base(tableName).find(recordId);
      
      logger.info(`Record found in ${tableName}`, { id: record.id });
      return record;
    } catch (error) {
      if (error.statusCode === 404) {
        logger.warn(`Record not found in ${tableName} with ID: ${recordId}`);
        return null;
      }
      
      logger.error(`Error finding record in ${tableName}:`, error);
      throw new Error(`Failed to find record in ${tableName}`);
    }
  }

  /**
   * Update a record
   * @param {string} tableName - Name of the table
   * @param {string} recordId - Record ID to update
   * @param {Object} fields - Fields to update
   * @returns {Promise<Object>} Updated record
   */
  async update(tableName, recordId, fields) {
    try {
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      logger.info(`Updating record in ${tableName}`, { id: recordId, fieldCount: Object.keys(fields).length });

      const records = await this.base(tableName).update([
        { id: recordId, fields }
      ]);

      if (records.length === 0) {
        throw new Error('Failed to update record');
      }

      logger.info(`Record updated successfully in ${tableName}`, { id: records[0].id });
      return records[0];
    } catch (error) {
      logger.error(`Error updating record in ${tableName}:`, error);
      throw new Error(`Failed to update record in ${tableName}`);
    }
  }

  /**
   * Delete a record
   * @param {string} tableName - Name of the table
   * @param {string} recordId - Record ID to delete
   * @returns {Promise<Object>} Deleted record info
   */
  async delete(tableName, recordId) {
    try {
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      logger.info(`Deleting record in ${tableName} with ID: ${recordId}`);

      const records = await this.base(tableName).destroy([recordId]);
      
      if (records.length === 0) {
        throw new Error('Failed to delete record');
      }

      logger.info(`Record deleted successfully in ${tableName}`, { id: records[0].id });
      return records[0];
    } catch (error) {
      logger.error(`Error deleting record in ${tableName}:`, error);
      throw new Error(`Failed to delete record in ${tableName}`);
    }
  }

  /**
   * Find all records in a table
   * @param {string} tableName - Name of the table
   * @param {Object} options - Query options (sort, fields, etc.)
   * @returns {Promise<Array>} All records
   */
  async findAll(tableName, options = {}) {
    try {
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      logger.info(`Finding all records in ${tableName}`, options);

      const records = [];
      
      await this.base(tableName).select(options).eachPage((pageRecords) => {
        records.push(...pageRecords);
      });

      logger.info(`Found ${records.length} records in ${tableName}`);
      return records;
    } catch (error) {
      logger.error(`Error finding all records in ${tableName}:`, error);
      throw new Error(`Failed to find records in ${tableName}`);
    }
  }

  /**
   * Create multiple records
   * @param {string} tableName - Name of the table
   * @param {Array} recordsData - Array of record objects with fields
   * @returns {Promise<Array>} Created records
   */
  async createMultiple(tableName, recordsData) {
    try {
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      logger.info(`Creating ${recordsData.length} records in ${tableName}`);

      const records = await this.base(tableName).create(recordsData);

      logger.info(`${records.length} records created successfully in ${tableName}`);
      return records;
    } catch (error) {
      logger.error(`Error creating multiple records in ${tableName}:`, error);
      throw new Error(`Failed to create records in ${tableName}`);
    }
  }

  /**
   * Find records by multiple field conditions (AND logic)
   * @param {string} tableName - Name of the table
   * @param {Object} fieldConditions - Object with field names as keys and values to match
   * @returns {Promise<Array>} Matching records
   */
  async findByMultipleFields(tableName, fieldConditions) {
    try {
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      logger.info(`Finding records in ${tableName} with conditions:`, fieldConditions);

      // Build filter formula for multiple fields
      const conditions = Object.entries(fieldConditions)
        .filter(([key, value]) => value !== null && value !== undefined)
        .map(([fieldName, fieldValue]) => {
          if (Array.isArray(fieldValue)) {
            // Handle array values (for linked records)
            return `ARRAYJOIN({${fieldName}}) = "${fieldValue.join(',')}"`;
          }
          return `{${fieldName}} = "${fieldValue}"`;
        });

      if (conditions.length === 0) {
        logger.warn('No valid conditions provided for findByMultipleFields');
        return [];
      }

      const filterFormula = conditions.length === 1 
        ? conditions[0]
        : `AND(${conditions.join(', ')})`;

      const selectOptions = {
        filterByFormula: filterFormula,
        maxRecords: 10
      };

      const records = await this.base(tableName).select(selectOptions).firstPage();

      logger.info(`Found ${records.length} records in ${tableName} matching conditions`);
      return records;
    } catch (error) {
      logger.error(`Error finding records by multiple fields in ${tableName}:`, error.message || error);
      throw new Error(`Failed to find records in ${tableName}: ${error.message}`);
    }
  }

  /**
   * Check if a record exists with given field conditions
   * @param {string} tableName - Name of the table
   * @param {Object} fieldConditions - Object with field names as keys and values to match
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
   * Get table schema information
   * @param {string} tableName - Name of the table
   * @returns {Promise<Object>} Table schema
   */
  async getTableSchema(tableName) {
    try {
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      // This is a simple way to get table info by fetching one record
      const records = await this.base(tableName).select({ maxRecords: 1 }).firstPage();
      
      if (records.length > 0) {
        const fieldNames = Object.keys(records[0].fields);
        return {
          tableName,
          fields: fieldNames,
          sampleRecord: records[0]
        };
      }

      return {
        tableName,
        fields: [],
        sampleRecord: null
      };
    } catch (error) {
      logger.error(`Error getting schema for ${tableName}:`, error);
      throw new Error(`Failed to get schema for ${tableName}`);
    }
  }
}

module.exports = new AirtableService();