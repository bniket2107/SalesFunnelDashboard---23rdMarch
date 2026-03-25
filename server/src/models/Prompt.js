const mongoose = require('mongoose');

// Framework types for Content Planner
const FRAMEWORK_TYPES = [
  'PAS',           // Problem-Agitate-Solution
  'AIDA',          // Attention-Interest-Desire-Action
  'BAB',           // Before-After-Bridge
  '4C',            // Clear-Concise-Compelling-Credible
  'STORY',         // Storytelling Framework
  'DIRECT_RESPONSE', // Direct Response
  'HOOKS',         // Hook Generator
  'OBJECTION',     // Objection Handling
  'PASTOR',        // Problem-Amplify-Story-Testimony-Offer-Response
  'QUEST',         // Qualify-Understand-Educate-Stimulate-Transition
  'ACCA',          // Awareness-Comparison-Consideration-Action
  'FAB',           // Features-Advantages-Benefits
  '5A',            // Aware-Appeal-Ask-Act-Assess
  'SLAP',          // Stop-Look-Act-Purchase
  'HOOK_STORY_OFFER', // Hook-Story-Offer
  '4P',            // Picture-Promise-Prove-Push
  'MASTER'         // Master Framework (Multi-framework)
];

const promptSchema = new mongoose.Schema({
  // Prompt identification
  title: {
    type: String,
    required: [true, 'Prompt title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },

  // Who this prompt is for
  role: {
    type: String,
    required: [true, 'Role is required'],
    enum: ['content_writer', 'graphic_designer', 'video_editor', 'ui_ux_designer', 'developer', 'tester'],
    index: true
  },

  // Framework Type (Required for content_writer role)
  frameworkType: {
    type: String,
    enum: FRAMEWORK_TYPES,
    required: function() {
      return this.role === 'content_writer';
    }
  },

  // SubCategory within the framework (Optional)
  // Allows for more granular organization of prompts
  // Example: For PAS framework, subCategory could be 'problem_hook', 'pain_point', etc.
  // If not provided, the prompt is considered a "framework-level" prompt (backward compatible)
  subCategory: {
    type: String,
    default: null,
    trim: true,
    // This is the key from FrameworkCategory model
    // Must match a FrameworkCategory.key for the given frameworkType
  },

  // The prompt content (base prompt template)
  content: {
    type: String,
    required: [true, 'Prompt content is required'],
    trim: true
  },

  // Category for organization (Not used for content_writer)
  category: {
    type: String,
    enum: ['instagram', 'facebook', 'youtube', 'linkedin', 'landing_page', 'email', 'video', 'general'],
    default: 'general'
  },

  // Platform this prompt is optimized for (Not used for content_writer)
  platform: {
    type: String,
    enum: ['instagram', 'facebook', 'youtube', 'linkedin', 'google_ads', 'landing_page', 'email', 'video', 'all'],
    default: 'all'
  },

  // Funnel stage this prompt targets
  funnelStage: {
    type: String,
    enum: ['awareness', 'consideration', 'conversion', 'all'],
    default: 'all'
  },

  // Creative type this prompt is for
  creativeType: {
    type: String,
    enum: ['image', 'carousel', 'video', 'story', 'reel', 'copy', 'script', 'landing_page', 'email', 'all'],
    default: 'all'
  },

  // Description/notes about this prompt
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },

  // Tags for search/filter
  tags: [{
    type: String,
    trim: true
  }],

  // Usage tracking
  usageCount: {
    type: Number,
    default: 0
  },

  // Active status
  isActive: {
    type: Boolean,
    default: true
  },

  // System prompt (cannot be deleted by admins)
  isSystem: {
    type: Boolean,
    default: false
  },

  // Created by (admin)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Not required for system prompts
  },

  // Timestamps
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for efficient queries
promptSchema.index({ role: 1, isActive: 1 });
promptSchema.index({ frameworkType: 1 });
promptSchema.index({ frameworkType: 1, subCategory: 1 }); // For subcategory lookups
promptSchema.index({ frameworkType: 1, subCategory: 1, isActive: 1 }); // For prompt selection
promptSchema.index({ category: 1, platform: 1 });
promptSchema.index({ funnelStage: 1, creativeType: 1 });

// Static method to get prompts by role
promptSchema.statics.getByRole = function(role) {
  return this.find({ role, isActive: true }).sort({ createdAt: -1 });
};

// Static method to get prompts by filters
promptSchema.statics.getByFilters = function(filters = {}) {
  const query = { isActive: true };

  if (filters.role) query.role = filters.role;
  if (filters.frameworkType) query.frameworkType = filters.frameworkType;
  if (filters.subCategory) query.subCategory = filters.subCategory;
  if (filters.category) query.category = filters.category;
  if (filters.platform) query.platform = { $in: [filters.platform, 'all'] };
  if (filters.funnelStage) query.funnelStage = { $in: [filters.funnelStage, 'all'] };
  if (filters.creativeType) query.creativeType = { $in: [filters.creativeType, 'all'] };

  return this.find(query).sort({ usageCount: 1, createdAt: -1 });
};

// Static method to get prompts for generation with fallback logic
// Priority: subCategory specific > framework-only (subCategory = null)
promptSchema.statics.getForGeneration = async function(frameworkType, subCategory = null) {
  if (subCategory) {
    // Try to find prompts with the specific subCategory
    const specificPrompts = await this.find({
      frameworkType,
      subCategory,
      isActive: true
    }).sort({ usageCount: 1, createdAt: -1 });

    if (specificPrompts.length > 0) {
      return { prompts: specificPrompts, isFallback: false };
    }

    // Fallback to framework-only prompts (subCategory = null)
    const fallbackPrompts = await this.find({
      frameworkType,
      $or: [
        { subCategory: null },
        { subCategory: { $exists: false } }
      ],
      isActive: true
    }).sort({ usageCount: 1, createdAt: -1 });

    return { prompts: fallbackPrompts, isFallback: true };
  }

  // No subCategory specified, get framework-only prompts
  const frameworkPrompts = await this.find({
    frameworkType,
    $or: [
      { subCategory: null },
      { subCategory: { $exists: false } }
    ],
    isActive: true
  }).sort({ usageCount: 1, createdAt: -1 });

  return { prompts: frameworkPrompts, isFallback: false };
};

// Increment usage count
promptSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  return this.save();
};

// Export framework types for use in other files
module.exports = mongoose.model('Prompt', promptSchema);
module.exports.FRAMEWORK_TYPES = FRAMEWORK_TYPES;