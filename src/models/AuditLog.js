const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const auditLogSchema = new mongoose.Schema({
  // Log Identification
  logId: {
    type: String,
    unique: true,
    required: true,
    default: () => `LOG_${Date.now()}_${uuidv4().substr(0, 8)}`
  },
  
  // Event Information
  event: {
    type: String,
    required: [true, 'Event name is required'],
    trim: true,
    index: true
  },
  
  // Event Type
  eventType: {
    type: String,
    required: [true, 'Event type is required'],
    enum: [
      // System Events
      'system_startup',
      'system_shutdown',
      'system_error',
      'system_warning',
      'system_info',
      'cron_job',
      'background_job',
      'maintenance',
      'backup',
      'update',
      
      // Authentication Events
      'login',
      'login_failed',
      'logout',
      'register',
      'password_reset',
      'password_change',
      'two_factor_enabled',
      'two_factor_disabled',
      'account_locked',
      'account_unlocked',
      'session_created',
      'session_revoked',
      'token_refreshed',
      'token_revoked',
      'device_authorized',
      'device_blocked',
      
      // User Events
      'profile_updated',
      'email_updated',
      'phone_updated',
      'preferences_updated',
      'notification_preferences_updated',
      'privacy_settings_updated',
      'account_deactivated',
      'account_deleted',
      
      // Crop Events
      'crop_created',
      'crop_updated',
      'crop_deleted',
      'crop_status_changed',
      'crop_verified',
      'crop_rejected',
      'crop_harvested',
      'crop_sold',
      'crop_price_updated',
      'crop_quantity_updated',
      
      // Order & Transaction Events
      'order_created',
      'order_updated',
      'order_cancelled',
      'order_completed',
      'payment_initiated',
      'payment_completed',
      'payment_failed',
      'refund_initiated',
      'refund_completed',
      'refund_failed',
      'withdrawal_requested',
      'withdrawal_processed',
      'withdrawal_failed',
      
      // Blockchain Events
      'blockchain_transaction_sent',
      'blockchain_transaction_confirmed',
      'blockchain_transaction_failed',
      'nft_minted',
      'nft_transferred',
      'smart_contract_deployed',
      'smart_contract_updated',
      'oracle_updated',
      
      // Admin Events
      'admin_action',
      'user_blocked',
      'user_unblocked',
      'content_flagged',
      'content_removed',
      'settings_updated',
      'permission_granted',
      'permission_revoked',
      'role_created',
      'role_updated',
      'role_deleted',
      
      // API Events
      'api_call',
      'api_error',
      'rate_limit_exceeded',
      'authentication_failed',
      'authorization_failed',
      'validation_failed',
      
      // Custom Events
      'custom'
    ]
  },
  
  // Event Severity
  severity: {
    type: String,
    required: [true, 'Severity is required'],
    enum: ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'],
    default: 'info'
  },
  
  // Event Status
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
    default: 'completed'
  },
  
  // Actor Information
  actor: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  
  // Target Information
  target: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  
  // Request Information
  request: {
    method: String,
    url: String,
    path: String,
    params: mongoose.Schema.Types.Mixed,
    query: mongoose.Schema.Types.Mixed,
    body: mongoose.Schema.Types.Mixed,
    headers: mongoose.Schema.Types.Mixed,
    ip: String,
    userAgent: String,
    referrer: String
  },
  
  // Response Information
  response: {
    statusCode: Number,
    statusMessage: String,
    headers: mongoose.Schema.Types.Mixed,
    body: mongoose.Schema.Types.Mixed,
    duration: Number
  },
  
  // Error Information
  error: {
    name: String,
    message: String,
    code: String,
    stack: String,
    details: mongoose.Schema.Types.Mixed
  },
  
  // Changes (for update operations)
  changes: {
    oldValues: mongoose.Schema.Types.Mixed,
    newValues: mongoose.Schema.Types.Mixed,
    changedFields: [String]
  },
  
  // Context
  context: {
    appVersion: String,
    environment: String,
    hostname: String,
    processId: String,
    requestId: String,
    sessionId: String,
    correlationId: String,
    userRoles: [String],
    userPermissions: [String],
    tags: [String],
    custom: mongoose.Schema.Types.Mixed
  },
  
  // Metadata
  metadata: mongoose.Schema.Types.Mixed,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Expiration (for automatic cleanup)
  expiresAt: {
    type: Date,
    index: { expires: 0 } // TTL index for auto-deletion
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
auditLogSchema.index({ eventType: 1, createdAt: -1 });
auditLogSchema.index({ 'actor.id': 1, createdAt: -1 });
auditLogSchema.index({ 'target.id': 1, createdAt: -1 });
auditLogSchema.index({ 'target.type': 1, createdAt: -1 });
auditLogSchema.index({ 'context.requestId': 1 });
auditLogSchema.index({ 'context.correlationId': 1 });

// Pre-save hook to set default expiration (90 days from creation)
auditLogSchema.pre('save', function(next) {
  if (!this.expiresAt) {
    const expiresInDays = 90; // Default retention period in days
    this.expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  }
  
  // Set updatedAt timestamp
  this.updatedAt = new Date();
  
  next();
});

// Static method to log an event
auditLogSchema.statics.logEvent = async function({
  event,
  eventType,
  severity = 'info',
  status = 'completed',
  actor = null,
  target = null,
  request = null,
  response = null,
  error = null,
  changes = {},
  context = {},
  metadata = {},
  expiresInDays = 90
}) {
  const logEntry = new this({
    event,
    eventType,
    severity,
    status,
    actor: this.sanitizeObject(actor),
    target: this.sanitizeObject(target),
    request: this.sanitizeObject(request),
    response: this.sanitizeObject(response),
    error: this.sanitizeError(error),
    changes: this.sanitizeChanges(changes),
    context: this.sanitizeContext(context),
    metadata,
    expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
  });
  
  await logEntry.save();
  return logEntry;
};

// Helper method to sanitize objects before saving
auditLogSchema.statics.sanitizeObject = function(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  // Create a copy to avoid modifying the original
  const sanitized = { ...obj };
  
  // Remove sensitive fields
  const sensitiveFields = [
    'password',
    'passwordHash',
    'passwordSalt',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'secret',
    'privateKey',
    'creditCard',
    'cvv',
    'ssn',
    'aadhaar',
    'pan',
    'bankAccount',
    'bankRouting',
    'authorization'
  ];
  
  // Recursively remove sensitive fields
  const removeSensitiveFields = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      if (sensitiveFields.includes(key.toLowerCase())) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        removeSensitiveFields(obj[key]);
      }
    });
  };
  
  removeSensitiveFields(sanitized);
  return sanitized;
};

// Helper method to sanitize error objects
auditLogSchema.statics.sanitizeError = function(error) {
  if (!error) return null;
  
  // Handle Error objects
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
      ...(error.details && { details: this.sanitizeObject(error.details) })
    };
  }
  
  // Handle error-like objects
  if (typeof error === 'object') {
    return {
      name: error.name || 'Error',
      message: error.message || 'An unknown error occurred',
      code: error.code,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
      ...(error.details && { details: this.sanitizeObject(error.details) })
    };
  }
  
  // Handle string errors
  return {
    name: 'Error',
    message: String(error)
  };
};

// Helper method to sanitize changes
auditLogSchema.statics.sanitizeChanges = function(changes) {
  if (!changes || typeof changes !== 'object') {
    return {
      oldValues: {},
      newValues: {},
      changedFields: []
    };
  }
  
  const sanitized = {
    oldValues: this.sanitizeObject(changes.oldValues || {}),
    newValues: this.sanitizeObject(changes.newValues || {}),
    changedFields: Array.isArray(changes.changedFields) 
      ? [...changes.changedFields] 
      : []
  };
  
  // If changedFields is empty but we have old and new values, detect changes
  if (sanitized.changedFields.length === 0 && 
      Object.keys(sanitized.oldValues).length > 0 &&
      Object.keys(sanitized.newValues).length > 0) {
    sanitized.changedFields = Object.keys(sanitized.newValues);
  }
  
  return sanitized;
};

// Helper method to sanitize context
auditLogSchema.statics.sanitizeContext = function(context) {
  if (!context || typeof context !== 'object') {
    return {};
  }
  
  // Create a copy to avoid modifying the original
  const sanitized = { ...context };
  
  // Ensure required context fields
  if (!sanitized.environment) {
    sanitized.environment = process.env.NODE_ENV || 'development';
  }
  
  if (!sanitized.appVersion) {
    sanitized.appVersion = process.env.APP_VERSION || '1.0.0';
  }
  
  if (!sanitized.hostname && typeof process !== 'undefined') {
    sanitized.hostname = process.env.HOSTNAME || require('os').hostname();
  }
  
  if (!sanitized.processId && typeof process !== 'undefined') {
    sanitized.processId = String(process.pid);
  }
  
  // Sanitize any nested objects
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'object') {
      sanitized[key] = this.sanitizeObject(sanitized[key]);
    }
  });
  
  return sanitized;
};

// Static method to search logs
// auditLogSchema.statics.search = async function({
//   query = {},
//   page = 1,
//   limit = 50,
//   sort = '-createdAt',
//   startDate,
//   endDate,
//   ...filters
// } = {}) {
//   const filter = { ...query };
  
//   // Apply date range filter
//   if (startDate || endDate) {
//     filter.createdAt = {};
//     if (startDate) filter.createdAt.$gte = new Date(startDate);
//     if (endDate) filter.createdAt.$lte = new Date(endDate);
//   }
  
//   // Apply additional filters
//   Object.keys(filters).forEach(key => {
//     if (filters[key] !== undefined && filters[key] !== '') {
//       filter[key] = filters[key];
//     }
//   });
  
//   const options = {
//     page: parseInt(page, 10) || 1,
//     limit: Math.min(parseInt(limit, 10) || 50, 1000), // Max 1000 per page
//     sort,
//     lean: true,
//     leanWithId: false
//   };
  
//   return this.paginate(filter, options);
// };

// Static method to clean up old logs
auditLogSchema.statics.cleanupOldLogs = async function(daysToKeep = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const result = await this.deleteMany({
    $or: [
      { expiresAt: { $lt: new Date() } },
      { 
        expiresAt: { $exists: false },
        createdAt: { $lt: cutoffDate }
      }
    ]
  });
  
  return {
    deletedCount: result.deletedCount,
    message: `Deleted ${result.deletedCount} logs older than ${daysToKeep} days`
  };
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
