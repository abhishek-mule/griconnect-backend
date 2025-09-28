const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const webhookDeliverySchema = new mongoose.Schema({
  // Delivery Identification
  deliveryId: {
    type: String,
    unique: true,
    required: true,
    default: () => `whd_${uuidv4()}`
  },
  
  // Webhook Reference
  webhook: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Webhook',
    required: [true, 'Webhook reference is required'],
    index: true
  },
  
  // Event Information
  event: {
    type: String,
    required: [true, 'Event name is required'],
    trim: true,
    index: true
  },
  
  // Payload
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Payload is required']
  },
  
  // Delivery Status
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: [
      'pending',      // Delivery is queued
      'processing',   // Delivery is in progress
      'delivered',    // Delivery was successful (2xx response)
      'failed',       // Delivery failed (non-2xx response or network error)
      'retrying',     // Delivery failed and will be retried
      'discarded'     // Delivery failed and won't be retried
    ],
    default: 'pending',
    index: true
  },
  
  // Delivery Attempts
  attempts: [{
    _id: false,
    attempt: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'success', 'failure', 'timeout', 'error']
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    completedAt: {
      type: Date
    },
    duration: {
      type: Number, // in milliseconds
      default: 0
    },
    response: {
      status: Number,
      statusText: String,
      headers: mongoose.Schema.Types.Mixed,
      body: mongoose.Schema.Types.Mixed,
      size: Number // in bytes
    },
    error: {
      name: String,
      message: String,
      code: String,
      stack: String
    },
    ip: String,
    userAgent: String
  }],
  
  // Current Attempt
  currentAttempt: {
    type: Number,
    default: 0
  },
  
  // Next Retry At
  nextRetryAt: {
    type: Date,
    index: true
  },
  
  // Delivery Timestamps
  startedAt: {
    type: Date,
    default: Date.now
  },
  
  deliveredAt: Date,
  failedAt: Date,
  
  // Error Information
  error: {
    name: String,
    message: String,
    code: String,
    stack: String,
    details: mongoose.Schema.Types.Mixed
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
webhookDeliverySchema.index({ webhook: 1, status: 1 });
webhookDeliverySchema.index({ event: 1, status: 1 });
webhookDeliverySchema.index({ 'metadata.correlationId': 1 });
webhookDeliverySchema.index({ createdAt: -1 });
webhookDeliverySchema.index({ 'attempts.completedAt': -1 });

// Virtual for the latest attempt
webhookDeliverySchema.virtual('latestAttempt').get(function() {
  if (!this.attempts || this.attempts.length === 0) return null;
  return this.attempts[this.attempts.length - 1];
});

// Virtual for the first attempt
webhookDeliverySchema.virtual('firstAttempt').get(function() {
  if (!this.attempts || this.attempts.length === 0) return null;
  return this.attempts[0];
});

// Virtual for the next attempt number
webhookDeliverySchema.virtual('nextAttempt').get(function() {
  return (this.currentAttempt || 0) + 1;
});

// Pre-save hook to update timestamps and status
webhookDeliverySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Update status based on attempts
  if (this.attempts && this.attempts.length > 0) {
    const latestAttempt = this.attempts[this.attempts.length - 1];
    
    if (latestAttempt.status === 'success') {
      this.status = 'delivered';
      this.deliveredAt = this.deliveredAt || new Date();
    } else if (this.status === 'pending' || this.status === 'processing' || this.status === 'retrying') {
      this.status = 'failed';
      this.failedAt = new Date();
    }
  }
  
  next();
});

// Method to add a new attempt
webhookDeliverySchema.methods.addAttempt = async function(attemptData) {
  const attempt = {
    attempt: this.nextAttempt,
    status: attemptData.status || 'pending',
    startedAt: attemptData.startedAt || new Date(),
    completedAt: attemptData.completedAt,
    duration: attemptData.duration || 0,
    response: attemptData.response,
    error: attemptData.error,
    ip: attemptData.ip,
    userAgent: attemptData.userAgent
  };
  
  this.attempts = this.attempts || [];
  this.attempts.push(attempt);
  this.currentAttempt = attempt.attempt;
  
  // Update status based on attempt result
  if (attempt.status === 'success') {
    this.status = 'delivered';
    this.deliveredAt = new Date();
  } else if (this.status === 'pending' || this.status === 'processing') {
    this.status = 'failed';
    this.failedAt = new Date();
  }
  
  // Set error details if available
  if (attempt.error) {
    this.error = {
      name: attempt.error.name,
      message: attempt.error.message,
      code: attempt.error.code,
      stack: attempt.error.stack,
      details: attempt.error.details
    };
  }
  
  await this.save();
  return attempt;
};

// Method to calculate next retry time
webhookDeliverySchema.methods.calculateNextRetry = function(webhook) {
  if (!webhook || !webhook.retry || !webhook.retry.enabled) {
    return null;
  }
  
  const maxAttempts = webhook.retry.maxAttempts || 3;
  if (this.currentAttempt >= maxAttempts) {
    return null; // No more retries
  }
  
  const initialDelay = webhook.retry.initialDelayMs || 1000;
  const maxDelay = webhook.retry.maxDelayMs || 60 * 1000;
  const factor = webhook.retry.factor || 2;
  
  // Calculate delay with exponential backoff
  let delay = initialDelay * Math.pow(factor, this.currentAttempt - 1);
  
  // Add jitter to prevent thundering herd problem
  const jitter = Math.floor(Math.random() * 1000);
  delay = Math.min(delay + jitter, maxDelay);
  
  return new Date(Date.now() + delay);
};

// Method to prepare for retry
webhookDeliverySchema.methods.prepareForRetry = async function(webhook) {
  if (this.status !== 'failed') {
    throw new Error('Only failed deliveries can be retried');
  }
  
  const nextRetryAt = this.calculateNextRetry(webhook);
  
  if (!nextRetryAt) {
    this.status = 'discarded';
  } else {
    this.status = 'retrying';
    this.nextRetryAt = nextRetryAt;
  }
  
  return this.save();
};

// Static method to find deliveries ready for retry
webhookDeliverySchema.statics.findReadyForRetry = async function(limit = 100) {
  return this.find({
    status: 'retrying',
    nextRetryAt: { $lte: new Date() }
  })
  .sort({ nextRetryAt: 1 })
  .limit(limit)
  .populate('webhook');
};

// Static method to create a new delivery
webhookDeliverySchema.statics.createDelivery = async function({
  webhookId,
  event,
  payload,
  metadata = {}
}) {
  const delivery = new this({
    webhook: webhookId,
    event,
    payload,
    status: 'pending',
    metadata
  });
  
  await delivery.save();
  return delivery;
};

// Static method to get delivery statistics
webhookDeliverySchema.statics.getStats = async function(webhookId, options = {}) {
  const match = { webhook: webhookId };
  
  // Apply date range filter
  if (options.startDate || options.endDate) {
    match.createdAt = {};
    if (options.startDate) match.createdAt.$gte = new Date(options.startDate);
    if (options.endDate) match.createdAt.$lte = new Date(options.endDate);
  }
  
  // Apply event filter
  if (options.event) {
    match.event = options.event;
  }
  
  // Apply status filter
  if (options.status) {
    match.status = options.status;
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgDuration: { $avg: { $arrayElemAt: ['$attempts.duration', -1] } },
        minDuration: { $min: { $arrayElemAt: ['$attempts.duration', -1] } },
        maxDuration: { $max: { $arrayElemAt: ['$attempts.duration', -1] } },
        lastDelivery: { $max: '$createdAt' }
      }
    },
    {
      $project: {
        _id: 0,
        status: '$_id',
        count: 1,
        avgDuration: { $ifNull: ['$avgDuration', 0] },
        minDuration: { $ifNull: ['$minDuration', 0] },
        maxDuration: { $ifNull: ['$maxDuration', 0] },
        lastDelivery: 1
      }
    }
  ]);
  
  // Calculate success rate
  const total = stats.reduce((sum, stat) => sum + stat.count, 0);
  const successStat = stats.find(stat => stat.status === 'delivered');
  const successCount = successStat ? successStat.count : 0;
  const successRate = total > 0 ? (successCount / total) * 100 : 0;
  
  return {
    total,
    successRate,
    byStatus: stats,
    timeRange: {
      start: options.startDate ? new Date(options.startDate) : null,
      end: options.endDate ? new Date(options.endDate) : null
    }
  };
};

module.exports = mongoose.model('WebhookDelivery', webhookDeliverySchema);
