const Prompt = require('../models/Prompt');
const { generateFinalPrompt, checkOllamaHealth } = require('../services/ollamaService');
const { getFrameworkTemplate, getFrameworkTypes, replaceTemplatePlaceholders } = require('../utils/frameworkTemplates');

// @desc    Get all prompts (with filters)
// @route   GET /api/prompts
// @access  Private (Admin, Performance Marketer, Content Writer, etc.)
exports.getPrompts = async (req, res, next) => {
  try {
    const { role, category, platform, funnelStage, creativeType, isActive, frameworkType } = req.query;

    const query = {};

    // Filter by role (for team members to get their prompts)
    if (role) {
      query.role = role;
    }

    // Filter by framework type (for content_writer)
    if (frameworkType) {
      query.frameworkType = frameworkType;
    }

    // Filter by category (not used for content_writer)
    if (category && role !== 'content_writer') {
      query.category = category;
    }

    // Filter by platform (not used for content_writer)
    if (platform && role !== 'content_writer') {
      query.platform = { $in: [platform, 'all'] };
    }

    // Filter by funnel stage
    if (funnelStage) {
      query.funnelStage = { $in: [funnelStage, 'all'] };
    }

    // Filter by creative type
    if (creativeType) {
      query.creativeType = { $in: [creativeType, 'all'] };
    }

    // Filter by active status (admin can see all, others only active)
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    } else if (req.user.role !== 'admin') {
      query.isActive = true;
    }

    const prompts = await Prompt.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: prompts.length,
      data: prompts
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single prompt
// @route   GET /api/prompts/:id
// @access  Private
exports.getPrompt = async (req, res, next) => {
  try {
    const prompt = await Prompt.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: 'Prompt not found'
      });
    }

    res.status(200).json({
      success: true,
      data: prompt
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new prompt
// @route   POST /api/prompts
// @access  Private (Admin only)
exports.createPrompt = async (req, res, next) => {
  try {
    // Only admin can create prompts
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can create prompts'
      });
    }

    const {
      title,
      role,
      frameworkType,
      content,
      category,
      platform,
      funnelStage,
      creativeType,
      description,
      tags
    } = req.body;

    // Validate frameworkType for content_writer role
    if (role === 'content_writer' && !frameworkType) {
      return res.status(400).json({
        success: false,
        message: 'Framework type is required for Content Planner role'
      });
    }

    // If frameworkType is provided, get the template content
    let promptContent = content;
    if (role === 'content_writer' && frameworkType && !content) {
      promptContent = getFrameworkTemplate(frameworkType);
    }

    const prompt = await Prompt.create({
      title,
      role,
      frameworkType: role === 'content_writer' ? frameworkType : undefined,
      content: promptContent,
      // Only include category and platform for non-content_writer roles
      category: role === 'content_writer' ? undefined : (category || 'general'),
      platform: role === 'content_writer' ? undefined : (platform || 'all'),
      funnelStage: funnelStage || 'all',
      creativeType: creativeType || 'all',
      description,
      tags: tags || [],
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      data: prompt,
      message: 'Prompt created successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update prompt
// @route   PUT /api/prompts/:id
// @access  Private (Admin only)
exports.updatePrompt = async (req, res, next) => {
  try {
    // Only admin can update prompts
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update prompts'
      });
    }

    const {
      title,
      role,
      frameworkType,
      content,
      category,
      platform,
      funnelStage,
      creativeType,
      description,
      tags,
      isActive
    } = req.body;

    const prompt = await Prompt.findById(req.params.id);

    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: 'Prompt not found'
      });
    }

    // Update fields
    if (title !== undefined) prompt.title = title;
    if (role !== undefined) prompt.role = role;
    if (frameworkType !== undefined) prompt.frameworkType = frameworkType;
    if (content !== undefined) prompt.content = content;
    // Only update category and platform for non-content_writer roles
    if (category !== undefined && prompt.role !== 'content_writer') prompt.category = category;
    if (platform !== undefined && prompt.role !== 'content_writer') prompt.platform = platform;
    if (funnelStage !== undefined) prompt.funnelStage = funnelStage;
    if (creativeType !== undefined) prompt.creativeType = creativeType;
    if (description !== undefined) prompt.description = description;
    if (tags !== undefined) prompt.tags = tags;
    if (isActive !== undefined) prompt.isActive = isActive;

    await prompt.save();

    res.status(200).json({
      success: true,
      data: prompt,
      message: 'Prompt updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete prompt
// @route   DELETE /api/prompts/:id
// @access  Private (Admin only)
exports.deletePrompt = async (req, res, next) => {
  try {
    // Only admin can delete prompts
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can delete prompts'
      });
    }

    const prompt = await Prompt.findById(req.params.id);

    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: 'Prompt not found'
      });
    }

    await prompt.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Prompt deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle prompt active status
// @route   PUT /api/prompts/:id/toggle-active
// @access  Private (Admin only)
exports.togglePromptActive = async (req, res, next) => {
  try {
    // Only admin can toggle active status
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can toggle prompt status'
      });
    }

    const prompt = await Prompt.findById(req.params.id);

    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: 'Prompt not found'
      });
    }

    prompt.isActive = !prompt.isActive;
    await prompt.save();

    res.status(200).json({
      success: true,
      data: prompt,
      message: `Prompt ${prompt.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get prompts by role (for team members)
// @route   GET /api/prompts/by-role/:role
// @access  Private
exports.getPromptsByRole = async (req, res, next) => {
  try {
    const { role } = req.params;

    // Validate role
    const validRoles = ['content_writer', 'graphic_designer', 'video_editor', 'ui_ux_designer', 'developer', 'tester'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    // Only allow users to see prompts for their role (or admin can see all)
    if (req.user.role !== 'admin' && req.user.role !== role) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access these prompts'
      });
    }

    const prompts = await Prompt.find({
      role,
      isActive: true
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: prompts.length,
      data: prompts
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate AI prompt using Ollama
// @route   POST /api/prompts/generate
// @access  Private
exports.generatePrompt = async (req, res, next) => {
  try {
    const { basePromptId, frameworkType, context } = req.body;

    // Validate input
    if (!basePromptId && !context?.basePrompt && !frameworkType) {
      return res.status(400).json({
        success: false,
        message: 'Either basePromptId, frameworkType, or basePrompt in context is required'
      });
    }

    let basePrompt = context?.basePrompt;

    // If frameworkType is provided, get the framework template
    if (frameworkType && !basePromptId) {
      basePrompt = getFrameworkTemplate(frameworkType);
      if (!basePrompt) {
        return res.status(400).json({
          success: false,
          message: 'Invalid framework type'
        });
      }
    }

    // If basePromptId is provided, fetch from database
    if (basePromptId) {
      const prompt = await Prompt.findById(basePromptId);

      if (!prompt) {
        return res.status(404).json({
          success: false,
          message: 'Base prompt not found'
        });
      }

      if (!prompt.isActive) {
        return res.status(400).json({
          success: false,
          message: 'This prompt is not active'
        });
      }

      basePrompt = prompt.content;

      // Increment usage count
      await prompt.incrementUsage();
    }

    // Replace placeholders in framework template
    if (frameworkType || basePromptId) {
      basePrompt = replaceTemplatePlaceholders(basePrompt, {
        problem: context?.problem || '',
        audience: context?.audience || '',
        platform: context?.platform || '',
        funnelStage: context?.funnelStage || '',
        brandName: context?.brandName || '',
        industry: context?.industry || '',
        painPoints: context?.painPoints || [],
        desires: context?.desires || [],
        offer: context?.offer || '',
        hook: context?.hook || '',
        headline: context?.headline || '',
        cta: context?.cta || ''
      });
    }

    // Generate the final prompt using Ollama
    const finalPrompt = await generateFinalPrompt({
      basePrompt,
      context: {
        problem: context?.problem || '',
        audience: context?.audience || '',
        platform: context?.platform || '',
        funnelStage: context?.funnelStage || '',
        goal: context?.goal || '',
        offer: context?.offer || '',
        creativeType: context?.creativeType || '',
        hook: context?.hook || '',
        headline: context?.headline || '',
        cta: context?.cta || '',
        brandName: context?.brandName || '',
        industry: context?.industry || '',
        painPoints: context?.painPoints || [],
        desires: context?.desires || []
      }
    });

    res.status(200).json({
      success: true,
      data: {
        finalPrompt
      }
    });
  } catch (error) {
    console.error('Error generating prompt:', error);

    // Handle Ollama-specific errors
    if (error.message.includes('Ollama')) {
      return res.status(503).json({
        success: false,
        message: 'AI service is unavailable. Please make sure Ollama is running.',
        error: error.message
      });
    }

    next(error);
  }
};

// @desc    Get available framework types
// @route   GET /api/prompts/frameworks
// @access  Private
exports.getFrameworkTypes = async (req, res, next) => {
  try {
    const frameworks = getFrameworkTypes();

    res.status(200).json({
      success: true,
      data: frameworks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Check Ollama health status
// @route   GET /api/prompts/ollama-status
// @access  Private (Admin only)
exports.getOllamaStatus = async (req, res, next) => {
  try {
    // Only admin can check Ollama status
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can check Ollama status'
      });
    }

    const status = await checkOllamaHealth();

    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
};