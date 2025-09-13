const { logger } = require('../utils');
const { contentType, aiPrompts } = require('../models');
const { validationResult } = require('express-validator');

class AdminController {
  /**
   * Admin Dashboard
   * GET /admin
   */
  async dashboard(req, res) {
    try {
      // Get system statistics for dashboard
      const contentTypeStats = await contentType.getUsageStatistics();
      const promptStats = await aiPrompts.getPromptsStatistics();
      
      res.render('admin/dashboard', {
        title: 'Admin Dashboard',
        user: req.user,
        subscription: req.subscriptionInfo,
        contentTypeStats,
        promptStats
      });
    } catch (error) {
      logger.error('Error loading admin dashboard:', error);
      res.status(500).render('errors/500', {
        title: 'Dashboard Error',
        message: 'Failed to load admin dashboard.',
        user: req.user,
        subscription: req.subscriptionInfo
      });
    }
  }

  /**
   * Content Types Index
   * GET /admin/content-types
   */
  async contentTypesIndex(req, res) {
    try {
      const { page = 1, limit = 20, search, status } = req.query;
      
      // Get content types with pagination
      const options = {
        page: parseInt(page),
        limit: parseInt(limit)
      };

      if (search) {
        options.search = search;
      }

      if (status === 'inactive') {
        options.activeOnly = false;
      }

      const contentTypes = await contentType.findAll(
        status === 'inactive' ? { is_active: false } : {},
        options
      );

      // Get prompt counts for each content type
      const promptCounts = await aiPrompts.getProviderCountsByContentType();
      const promptCountMap = {};
      promptCounts.forEach(pc => {
        promptCountMap[pc.content_type] = {
          count: parseInt(pc.provider_count),
          providers: pc.providers
        };
      });

      res.render('admin/content-types/index', {
        title: 'Manage Content Types',
        user: req.user,
        subscription: req.subscriptionInfo,
        contentTypes: contentTypes.data || contentTypes,
        promptCounts: promptCountMap,
        currentPage: parseInt(page),
        search: search || '',
        status: status || 'active'
      });
    } catch (error) {
      logger.error('Error loading content types:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      console.error('DEBUG: Full error details:', error);
      res.status(500).render('errors/500', {
        title: 'Content Types Error',
        message: 'Failed to load content types.',
        user: req.user,
        subscription: req.subscriptionInfo
      });
    }
  }

  /**
   * Show New Content Type Form
   * GET /admin/content-types/new
   */
  async newContentType(req, res) {
    try {
      // Get next display order
      const existingTypes = await contentType.getActive();
      const maxOrder = Math.max(...existingTypes.map(ct => ct.display_order || 0));
      const nextOrder = maxOrder + 1;

      res.render('admin/content-types/new', {
        title: 'Create New Content Type',
        user: req.user,
        subscription: req.subscriptionInfo,
        suggestedOrder: nextOrder
      });
    } catch (error) {
      logger.error('Error showing new content type form:', error);
      res.status(500).render('errors/500', {
        title: 'Form Error',
        message: 'Failed to load content type creation form.',
        user: req.user,
        subscription: req.subscriptionInfo
      });
    }
  }

  /**
   * Create Content Type
   * POST /admin/content-types
   */
  async createContentType(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).render('admin/content-types/new', {
          title: 'Create New Content Type',
          user: req.user,
          subscription: req.subscriptionInfo,
          errors: errors.array(),
          formData: req.body
        });
      }

      const {
        key,
        label,
        description,
        icon,
        display_order,
        requires_ai,
        has_url_field,
        is_active,
        prompts
      } = req.body;

      const newContentType = await contentType.create({
        key,
        label,
        description,
        icon,
        display_order: parseInt(display_order),
        requires_ai: requires_ai === 'on',
        has_url_field: has_url_field === 'on',
        is_active: is_active !== 'off' // Default to true unless explicitly unchecked
      });

      // Create AI prompts if any were provided
      if (prompts && typeof prompts === 'object') {
        const promptKeys = Object.keys(prompts);
        for (const promptKey of promptKeys) {
          const promptData = prompts[promptKey];
          
          // Skip empty or invalid prompts
          if (!promptData.name || !promptData.ai_provider || !promptData.prompt_text) {
            continue;
          }

          try {
            await aiPrompts.createPrompt({
              name: promptData.name,
              description: promptData.description || '',
              ai_provider: promptData.ai_provider,
              content_type_id: newContentType.id,
              prompt_text: promptData.prompt_text,
              system_message: promptData.system_message || null,
              temperature: parseFloat(promptData.temperature || 0.7),
              max_tokens: parseInt(promptData.max_tokens || 2000),
              is_active: promptData.is_active !== 'false'
            });

            logger.info(`Created AI prompt "${promptData.name}" for content type: ${key}`, {
              contentTypeId: newContentType.id,
              aiProvider: promptData.ai_provider,
              adminUserId: req.user.id
            });
          } catch (promptError) {
            logger.error('Error creating AI prompt:', promptError);
            // Continue creating other prompts even if one fails
          }
        }
      }

      logger.info(`Admin ${req.user.email} created content type: ${key}`, {
        contentTypeId: newContentType.id,
        adminUserId: req.user.id
      });

      req.flash('success', `Content type "${label}" created successfully!`);
      res.redirect(`/admin/content-types/${newContentType.id}`);
    } catch (error) {
      logger.error('Error creating content type:', error);
      
      // Handle unique constraint errors
      if (error.code === '23505') { // PostgreSQL unique violation
        req.flash('error', 'A content type with that key already exists.');
        return res.status(400).render('admin/content-types/new', {
          title: 'Create New Content Type',
          user: req.user,
          subscription: req.subscriptionInfo,
          formData: req.body,
          error: 'A content type with that key already exists.'
        });
      }

      res.status(500).render('errors/500', {
        title: 'Creation Error',
        message: 'Failed to create content type.',
        user: req.user,
        subscription: req.subscriptionInfo
      });
    }
  }

  /**
   * Show Content Type Details
   * GET /admin/content-types/:id
   */
  async showContentType(req, res) {
    try {
      const { id } = req.params;
      
      const ct = await contentType.findById(id);
      if (!ct) {
        return res.status(404).render('errors/404', {
          title: 'Content Type Not Found',
          message: 'The requested content type could not be found.',
          user: req.user,
          subscription: req.subscriptionInfo
        });
      }

      // Get associated AI prompts
      const prompts = await aiPrompts.getByContentType(id);
      
      res.render('admin/content-types/show', {
        title: `Content Type: ${ct.label}`,
        user: req.user,
        subscription: req.subscriptionInfo,
        contentType: ct,
        prompts
      });
    } catch (error) {
      logger.error('Error showing content type:', error);
      res.status(500).render('errors/500', {
        title: 'Content Type Error',
        message: 'Failed to load content type details.',
        user: req.user,
        subscription: req.subscriptionInfo
      });
    }
  }

  /**
   * Show Edit Content Type Form
   * GET /admin/content-types/:id/edit
   */
  async editContentType(req, res) {
    try {
      const { id } = req.params;
      
      const ct = await contentType.findById(id);
      if (!ct) {
        return res.status(404).render('errors/404', {
          title: 'Content Type Not Found',
          user: req.user,
          subscription: req.subscriptionInfo
        });
      }

      // Get existing AI prompts for this content type
      const existingPrompts = await aiPrompts.getByContentType(id);

      res.render('admin/content-types/edit', {
        title: `Edit: ${ct.label}`,
        user: req.user,
        subscription: req.subscriptionInfo,
        contentType: ct,
        existingPrompts
      });
    } catch (error) {
      logger.error('Error showing edit form:', error);
      res.status(500).render('errors/500', {
        title: 'Edit Error',
        user: req.user,
        subscription: req.subscriptionInfo
      });
    }
  }

  /**
   * Update Content Type
   * PUT /admin/content-types/:id
   */
  async updateContentType(req, res) {
    try {
      const { id } = req.params;
      const errors = validationResult(req);

      const ct = await contentType.findById(id);
      if (!ct) {
        return res.status(404).render('errors/404', {
          title: 'Content Type Not Found',
          user: req.user,
          subscription: req.subscriptionInfo
        });
      }

      if (!errors.isEmpty()) {
        return res.status(400).render('admin/content-types/edit', {
          title: `Edit: ${ct.label}`,
          user: req.user,
          subscription: req.subscriptionInfo,
          contentType: ct,
          errors: errors.array(),
          formData: req.body
        });
      }

      const updateData = {
        label: req.body.label,
        description: req.body.description,
        icon: req.body.icon,
        display_order: parseInt(req.body.display_order),
        requires_ai: req.body.requires_ai === 'on',
        has_url_field: req.body.has_url_field === 'on',
        is_active: req.body.is_active !== 'off'
      };

      await contentType.update(id, updateData);

      // Handle AI prompt changes
      const {
        existing_prompts,
        prompts,
        delete_prompts
      } = req.body;

      // Delete prompts marked for deletion
      if (delete_prompts && Array.isArray(delete_prompts)) {
        for (const promptId of delete_prompts) {
          try {
            await aiPrompts.delete(promptId);
            logger.info(`Deleted AI prompt ${promptId} for content type: ${ct.key}`, {
              contentTypeId: id,
              promptId,
              adminUserId: req.user.id
            });
          } catch (deleteError) {
            logger.error('Error deleting AI prompt:', deleteError);
          }
        }
      }

      // Update existing prompts
      if (existing_prompts && typeof existing_prompts === 'object') {
        const existingPromptKeys = Object.keys(existing_prompts);
        for (const promptId of existingPromptKeys) {
          const promptData = existing_prompts[promptId];
          
          if (!promptData.name || !promptData.ai_provider || !promptData.prompt_text) {
            continue;
          }

          try {
            await aiPrompts.update(promptId, {
              name: promptData.name,
              description: promptData.description || '',
              ai_provider: promptData.ai_provider,
              prompt_text: promptData.prompt_text,
              system_message: promptData.system_message || null,
              temperature: parseFloat(promptData.temperature || 0.7),
              max_tokens: parseInt(promptData.max_tokens || 2000),
              is_active: promptData.is_active !== 'false'
            });

            logger.info(`Updated AI prompt "${promptData.name}" for content type: ${ct.key}`, {
              contentTypeId: id,
              promptId,
              aiProvider: promptData.ai_provider,
              adminUserId: req.user.id
            });
          } catch (updateError) {
            logger.error('Error updating AI prompt:', updateError);
          }
        }
      }

      // Create new prompts
      if (prompts && typeof prompts === 'object') {
        const promptKeys = Object.keys(prompts);
        for (const promptKey of promptKeys) {
          const promptData = prompts[promptKey];
          
          if (!promptData.name || !promptData.ai_provider || !promptData.prompt_text) {
            continue;
          }

          try {
            await aiPrompts.createPrompt({
              name: promptData.name,
              description: promptData.description || '',
              ai_provider: promptData.ai_provider,
              content_type_id: id,
              prompt_text: promptData.prompt_text,
              system_message: promptData.system_message || null,
              temperature: parseFloat(promptData.temperature || 0.7),
              max_tokens: parseInt(promptData.max_tokens || 2000),
              is_active: promptData.is_active !== 'false'
            });

            logger.info(`Created new AI prompt "${promptData.name}" for content type: ${ct.key}`, {
              contentTypeId: id,
              aiProvider: promptData.ai_provider,
              adminUserId: req.user.id
            });
          } catch (createError) {
            logger.error('Error creating new AI prompt:', createError);
          }
        }
      }

      logger.info(`Admin ${req.user.email} updated content type: ${ct.key}`, {
        contentTypeId: id,
        adminUserId: req.user.id
      });

      req.flash('success', 'Content type updated successfully!');
      res.redirect(`/admin/content-types/${id}`);
    } catch (error) {
      logger.error('Error updating content type:', error);
      res.status(500).render('errors/500', {
        title: 'Update Error',
        user: req.user,
        subscription: req.subscriptionInfo
      });
    }
  }

  /**
   * Manage AI Prompts for Content Type
   * GET /admin/content-types/:id/prompts
   */
  async managePrompts(req, res) {
    try {
      const { id } = req.params;
      
      const ct = await contentType.findById(id);
      if (!ct) {
        return res.status(404).render('errors/404', {
          title: 'Content Type Not Found',
          user: req.user,
          subscription: req.subscriptionInfo
        });
      }

      const prompts = await aiPrompts.getByContentType(id, { includeInactive: true });
      const availableProviders = await aiPrompts.getAvailableProviders();

      res.render('admin/content-types/prompts', {
        title: `AI Prompts: ${ct.label}`,
        user: req.user,
        subscription: req.subscriptionInfo,
        contentType: ct,
        prompts,
        availableProviders
      });
    } catch (error) {
      logger.error('Error loading prompts:', error);
      res.status(500).render('errors/500', {
        title: 'Prompts Error',
        user: req.user,
        subscription: req.subscriptionInfo
      });
    }
  }

  /**
   * Create AI Prompt
   * POST /admin/content-types/:id/prompts
   */
  async createPrompt(req, res) {
    try {
      const { id } = req.params;
      const errors = validationResult(req);

      const ct = await contentType.findById(id);
      if (!ct) {
        return res.status(404).json({ error: 'Content type not found' });
      }

      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const {
        name,
        description,
        ai_provider,
        prompt_text,
        system_message,
        temperature,
        max_tokens
      } = req.body;

      const newPrompt = await aiPrompts.create({
        name,
        description,
        ai_provider,
        content_type_id: parseInt(id),
        prompt_text,
        system_message: system_message || null,
        temperature: parseFloat(temperature || 0.7),
        max_tokens: parseInt(max_tokens || 50000),
        is_active: true
      });

      logger.info(`Admin ${req.user.email} created AI prompt for ${ct.key}`, {
        promptId: newPrompt.id,
        contentTypeId: id,
        provider: ai_provider,
        adminUserId: req.user.id
      });

      res.json({ 
        success: true, 
        message: 'AI prompt created successfully!',
        prompt: newPrompt
      });
    } catch (error) {
      logger.error('Error creating AI prompt:', error);
      res.status(500).json({ error: 'Failed to create AI prompt' });
    }
  }

  /**
   * Update AI Prompt
   * PUT /admin/prompts/:promptId
   */
  async updatePrompt(req, res) {
    try {
      const { promptId } = req.params;
      const errors = validationResult(req);

      const prompt = await aiPrompts.findById(promptId);
      if (!prompt) {
        return res.status(404).json({ error: 'Prompt not found' });
      }

      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const updateData = {
        name: req.body.name,
        description: req.body.description,
        prompt_text: req.body.prompt_text,
        system_message: req.body.system_message || null,
        temperature: parseFloat(req.body.temperature || 0.7),
        max_tokens: parseInt(req.body.max_tokens || 50000),
        is_active: req.body.is_active !== 'false'
      };

      await aiPrompts.update(promptId, updateData);

      logger.info(`Admin ${req.user.email} updated AI prompt ${promptId}`, {
        promptId,
        adminUserId: req.user.id
      });

      res.json({ 
        success: true, 
        message: 'AI prompt updated successfully!' 
      });
    } catch (error) {
      logger.error('Error updating AI prompt:', error);
      res.status(500).json({ error: 'Failed to update AI prompt' });
    }
  }

  /**
   * Delete AI Prompt
   * DELETE /admin/prompts/:promptId
   */
  async deletePrompt(req, res) {
    try {
      const { promptId } = req.params;
      
      const prompt = await aiPrompts.findById(promptId);
      if (!prompt) {
        return res.status(404).json({ error: 'Prompt not found' });
      }

      await aiPrompts.delete(promptId);

      logger.info(`Admin ${req.user.email} deleted AI prompt ${promptId}`, {
        promptId,
        adminUserId: req.user.id
      });

      res.json({ 
        success: true, 
        message: 'AI prompt deleted successfully!' 
      });
    } catch (error) {
      logger.error('Error deleting AI prompt:', error);
      res.status(500).json({ error: 'Failed to delete AI prompt' });
    }
  }


  /**
   * Get Content Type Data (AJAX)
   * GET /admin/api/content-types/:id
   */
  async getContentTypeData(req, res) {
    try {
      const { id } = req.params;
      
      const ct = await contentType.findById(id);
      if (!ct) {
        return res.status(404).json({ error: 'Content type not found' });
      }

      const prompts = await aiPrompts.getByContentType(id, { includeInactive: true });

      res.json({
        success: true,
        contentType: ct,
        prompts
      });
    } catch (error) {
      logger.error('Error getting content type data:', error);
      res.status(500).json({ error: 'Failed to get content type data' });
    }
  }

  /**
   * Get AI Prompt Data (AJAX)
   * GET /admin/api/prompts/:promptId
   */
  async getPromptData(req, res) {
    try {
      const { promptId } = req.params;
      
      const prompt = await aiPrompts.findById(promptId);
      if (!prompt) {
        return res.status(404).json({ error: 'Prompt not found' });
      }

      res.json({
        success: true,
        prompt
      });
    } catch (error) {
      logger.error('Error getting prompt data:', error);
      res.status(500).json({ error: 'Failed to get prompt data' });
    }
  }
}

module.exports = new AdminController();