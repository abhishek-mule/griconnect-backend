const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const notificationTemplateSchema = new mongoose.Schema({
  // Template Identification
  templateId: {
    type: String,
    unique: true,
    required: true,
    default: () => `tmpl_${uuidv4()}`
  },
  
  // Template Name
  name: {
    type: String,
    required: [true, 'Template name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
    index: true
  },
  
  // Template Description
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // Template Type
  type: {
    type: String,
    required: [true, 'Template type is required'],
    enum: [
      // System Templates
      'system:user:welcome',
      'system:user:verification',
      'system:user:password_reset',
      'system:user:account_locked',
      'system:user:account_unlocked',
      'system:user:account_terminated',
      'system:user:login_alert',
      'system:user:profile_updated',
      'system:user:email_updated',
      'system:user:phone_updated',
      'system:user:password_updated',
      'system:user:two_factor_enabled',
      'system:user:two_factor_disabled',
      
      // Transaction Templates
      'transaction:payment:received',
      'transaction:payment:sent',
      'transaction:payment:failed',
      'transaction:refund:initiated',
      'transaction:refund:completed',
      'transaction:refund:failed',
      'transaction:withdrawal:requested',
      'transaction:withdrawal:processed',
      'transaction:withdrawal:failed',
      'transaction:deposit:received',
      'transaction:deposit:confirmed',
      'transaction:deposit:failed',
      
      // Order Templates
      'order:created',
      'order:confirmed',
      'order:shipped',
      'order:out_for_delivery',
      'order:delivered',
      'order:cancelled',
      'order:return_requested',
      'order:return_approved',
      'order:return_rejected',
      'order:refund_initiated',
      'order:refund_completed',
      'order:refund_failed',
      'order:dispute_opened',
      'order:dispute_updated',
      'order:dispute_resolved',
      
      // Crop Templates
      'crop:listed',
      'crop:updated',
      'crop:sold',
      'crop:price_updated',
      'crop:quantity_updated',
      'crop:status_updated',
      'crop:verification_requested',
      'crop:verified',
      'crop:rejected',
      'crop:inspection_scheduled',
      'crop:inspection_completed',
      'crop:certification_expiring_soon',
      'crop:certification_expired',
      
      // NFT Templates
      'nft:minted',
      'nft:transferred',
      'nft:burned',
      'nft:listed',
      'nft:unlisted',
      'nft:sold',
      'nft:auction_created',
      'nft:auction_updated',
      'nft:auction_cancelled',
      'nft:auction_ended',
      'nft:bid_placed',
      'nft:bid_withdrawn',
      'nft:royalty_paid',
      
      // Notification Templates
      'notification:email:generic',
      'notification:sms:generic',
      'notification:push:generic',
      'notification:in_app:generic',
      
      // Custom Templates
      'custom:marketing:promotion',
      'custom:marketing:newsletter',
      'custom:marketing:announcement',
      'custom:system:alert',
      'custom:system:warning',
      'custom:system:maintenance',
      'custom:system:update',
      'custom:user_defined'
    ]
  },
  
  // Template Category
  category: {
    type: String,
    enum: [
      'system', 'user', 'transaction', 'order', 'crop', 
      'nft', 'notification', 'marketing', 'custom', 'other'
    ],
    required: [true, 'Category is required'],
    index: true
  },
  
  // Template Status
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive', 'archived'],
    default: 'draft',
    index: true
  },
  
  // Template Channels
  channels: {
    email: {
      enabled: { type: Boolean, default: false },
      subject: { type: String, trim: true },
      text: { type: String, trim: true },
      html: { type: String, trim: true },
      layout: { type: String, default: 'default' },
      from: { type: String, trim: true },
      replyTo: { type: String, trim: true },
      cc: [{ type: String, trim: true }],
      bcc: [{ type: String, trim: true }],
      attachments: [{
        filename: String,
        content: String,
        contentType: String,
        path: String,
        cid: String,
        _id: false
      }]
    },
    sms: {
      enabled: { type: Boolean, default: false },
      message: { type: String, trim: true },
      from: { type: String, trim: true }
    },
    push: {
      enabled: { type: Boolean, default: false },
      title: { type: String, trim: true },
      body: { type: String, trim: true },
      image: { type: String, trim: true },
      icon: { type: String, trim: true },
      badge: { type: String, trim: true },
      sound: { type: String, trim: true },
      clickAction: { type: String, trim: true },
      data: { type: mongoose.Schema.Types.Mixed },
      android: { type: mongoose.Schema.Types.Mixed },
      apns: { type: mongoose.Schema.Types.Mixed },
      webpush: { type: mongoose.Schema.Types.Mixed }
    },
    inApp: {
      enabled: { type: Boolean, default: false },
      title: { type: String, trim: true },
      message: { type: String, trim: true },
      image: { type: String, trim: true },
      action: {
        type: { type: String, enum: ['url', 'route', 'function', 'none'], default: 'none' },
        target: { type: String, trim: true },
        method: { type: String, enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' },
        params: { type: mongoose.Schema.Types.Mixed }
      },
      priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
      expiresAt: { type: Date },
      data: { type: mongoose.Schema.Types.Mixed }
    },
    webhook: {
      enabled: { type: Boolean, default: false },
      url: { type: String, trim: true },
      method: { type: String, enum: ['POST', 'PUT', 'PATCH'], default: 'POST' },
      headers: [{
        name: { type: String, trim: true },
        value: { type: String, trim: true },
        _id: false
      }],
      body: { type: String, trim: true },
      contentType: { 
        type: String, 
        enum: ['application/json', 'application/x-www-form-urlencoded', 'text/plain'], 
        default: 'application/json' 
      }
    }
  },
  
  // Template Variables
  variables: [{
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: { 
      type: String, 
      enum: ['string', 'number', 'boolean', 'date', 'object', 'array'], 
      default: 'string' 
    },
    required: { type: Boolean, default: false },
    defaultValue: { type: mongoose.Schema.Types.Mixed },
    example: { type: String, trim: true },
    _id: false
  }],
  
  // Template Tags
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Localization
  locale: {
    type: String,
    default: 'en',
    index: true
  },
  
  // Versioning
  version: {
    type: Number,
    default: 1
  },
  
  // Parent Template (for versioning)
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NotificationTemplate',
    default: null
  },
  
  // Is this the latest version?
  isLatest: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Approval Information
  approval: {
    required: { type: Boolean, default: false },
    approved: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    notes: { type: String, trim: true }
  },
  
  // Audit Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by user is required']
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Soft Delete
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  
  deletedAt: {
    type: Date
  },
  
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
notificationTemplateSchema.index({ name: 1, locale: 1 }, { unique: true });
notificationTemplateSchema.index({ type: 1, status: 1, locale: 1 });
notificationTemplateSchema.index({ category: 1, status: 1 });
notificationTemplateSchema.index({ tags: 1 });
notificationTemplateSchema.index({ isLatest: 1, status: 1 });

// Pre-save hook to update timestamps and handle versioning
notificationTemplateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // If this is an update and certain fields have changed, create a new version
  if (this.isModified() && !this.isNew) {
    const fieldsToWatch = [
      'channels', 'variables', 'status', 'approval', 'isLatest'
    ];
    
    const hasImportantChanges = fieldsToWatch.some(field => this.isModified(field));
    
    if (hasImportantChanges && this.isLatest) {
      // Create a new version
      const newVersion = this.toObject();
      delete newVersion._id;
      delete newVersion.templateId;
      delete newVersion.createdAt;
      delete newVersion.updatedAt;
      
      newVersion.version = this.version + 1;
      newVersion.parent = this._id;
      newVersion.isLatest = true;
      
      // Save the new version
      return this.model('NotificationTemplate').create(newVersion)
        .then(() => {
          // Mark the current document as not the latest
          this.isLatest = false;
          next();
        })
        .catch(next);
    }
  }
  
  next();
});

// Method to render template with variables
notificationTemplateSchema.methods.render = function(variables = {}) {
  const result = {
    channels: {}
  };
  
  // Helper function to render template strings
  const renderTemplate = (template, vars) => {
    if (typeof template !== 'string') return template;
    
    return template.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const value = vars[key.trim()];
      return value !== undefined ? value : match;
    });
  };
  
  // Process each channel
  ['email', 'sms', 'push', 'inApp', 'webhook'].forEach(channel => {
    if (this.channels[channel]?.enabled) {
      result.channels[channel] = JSON.parse(JSON.stringify(this.channels[channel]));
      
      // Render template strings in the channel configuration
      const renderObject = (obj) => {
        if (typeof obj === 'string') {
          return renderTemplate(obj, variables);
        } else if (Array.isArray(obj)) {
          return obj.map(item => renderObject(item));
        } else if (obj && typeof obj === 'object') {
          const result = {};
          for (const key in obj) {
            result[key] = renderObject(obj[key]);
          }
          return result;
        }
        return obj;
      };
      
      result.channels[channel] = renderObject(result.channels[channel]);
    }
  });
  
  return result;
};

// Method to validate variables against the template
notificationTemplateSchema.methods.validateVariables = function(variables = {}) {
  const errors = [];
  const result = {};
  
  // Check required variables
  this.variables.forEach(variable => {
    const value = variables[variable.name];
    
    if (variable.required && (value === undefined || value === null || value === '')) {
      errors.push(`Variable '${variable.name}' is required`);
    } else if (value !== undefined && value !== null) {
      // Type checking
      let isValid = true;
      let typedValue = value;
      
      switch (variable.type) {
        case 'number':
          typedValue = Number(value);
          isValid = !isNaN(typedValue);
          break;
          
        case 'boolean':
          if (typeof value === 'string') {
            typedValue = value.toLowerCase() === 'true';
          } else {
            typedValue = Boolean(value);
          }
          break;
          
        case 'date':
          typedValue = new Date(value);
          isValid = !isNaN(typedValue.getTime());
          break;
          
        case 'object':
          try {
            if (typeof value === 'string') {
              typedValue = JSON.parse(value);
            }
            isValid = typeof typedValue === 'object' && !Array.isArray(typedValue);
          } catch (e) {
            isValid = false;
          }
          break;
          
        case 'array':
          try {
            if (typeof value === 'string') {
              typedValue = JSON.parse(value);
            }
            isValid = Array.isArray(typedValue);
          } catch (e) {
            isValid = false;
          }
          break;
      }
      
      if (!isValid) {
        errors.push(`Variable '${variable.name}' must be of type '${variable.type}'`);
      } else {
        result[variable.name] = typedValue;
      }
    } else if (variable.defaultValue !== undefined) {
      // Use default value if provided
      result[variable.name] = variable.defaultValue;
    }
  });
  
  // Check for extra variables that aren't defined in the template
  Object.keys(variables).forEach(key => {
    if (!this.variables.some(v => v.name === key)) {
      errors.push(`Unexpected variable: '${key}'`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    variables: result
  };
};

// Static method to find the latest version of a template
notificationTemplateSchema.statics.findLatestVersion = async function(templateId) {
  return this.findOne({
    $or: [
      { _id: templateId },
      { templateId: templateId }
    ]
  })
  .sort({ version: -1 })
  .limit(1);
};

// Static method to find templates by type and locale
notificationTemplateSchema.statics.findByTypeAndLocale = async function(type, locale = 'en') {
  return this.find({ type, locale, status: 'active', isLatest: true });
};

// Static method to find templates by category and status
notificationTemplateSchema.statics.findByCategory = async function(category, status = 'active') {
  return this.find({ category, status, isLatest: true });
};

// Static method to create a new version of a template
notificationTemplateSchema.statics.createNewVersion = async function(templateId, updates, userId) {
  const current = await this.findOne({
    $or: [
      { _id: templateId },
      { templateId: templateId }
    ]
  });
  
  if (!current) {
    throw new Error('Template not found');
  }
  
  // Create a new version
  const newVersion = new this({
    ...current.toObject(),
    ...updates,
    _id: undefined,
    templateId: `tmpl_${uuidv4()}`,
    version: current.version + 1,
    parent: current._id,
    isLatest: true,
    updatedBy: userId,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  
  // Mark the current version as not the latest
  current.isLatest = false;
  
  // Save both in a transaction
  const session = await this.startSession();
  session.startTransaction();
  
  try {
    await current.save({ session });
    const saved = await newVersion.save({ session });
    await session.commitTransaction();
    session.endSession();
    return saved;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// Static method to get template history
notificationTemplateSchema.statics.getHistory = async function(templateId) {
  return this.find({
    $or: [
      { _id: templateId },
      { templateId: templateId },
      { parent: templateId },
      { parent: mongoose.Types.ObjectId(templateId) }
    ]
  })
  .sort({ version: -1 })
  .populate('createdBy updatedBy', 'name email');
};

// Static method to search templates
notificationTemplateSchema.statics.search = async function(query = {}) {
  const {
    q,
    type,
    category,
    status,
    locale,
    tags,
    isLatest,
    page = 1,
    limit = 10,
    sortBy = 'updatedAt',
    sortOrder = 'desc'
  } = query;
  
  const filter = {};
  
  // Text search
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { 'channels.email.subject': { $regex: q, $options: 'i' } },
      { 'channels.sms.message': { $regex: q, $options: 'i' } },
      { 'channels.push.title': { $regex: q, $options: 'i' } },
      { 'channels.push.body': { $regex: q, $options: 'i' } },
      { 'channels.inApp.title': { $regex: q, $options: 'i' } },
      { 'channels.inApp.message': { $regex: q, $options: 'i' } }
    ];
  }
  
  // Apply filters
  if (type) filter.type = type;
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (locale) filter.locale = locale;
  if (tags) filter.tags = { $all: Array.isArray(tags) ? tags : [tags] };
  if (isLatest !== undefined) filter.isLatest = isLatest === 'true';
  
  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  // Execute query with pagination
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  
  const [templates, total] = await Promise.all([
    this.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('createdBy updatedBy', 'name email'),
    this.countDocuments(filter)
  ]);
  
  return {
    templates,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil(total / parseInt(limit, 10))
    }
  };
};

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
