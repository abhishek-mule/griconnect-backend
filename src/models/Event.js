const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const eventSchema = new mongoose.Schema({
  // Event Identification
  eventId: {
    type: String,
    unique: true,
    required: true,
    default: () => `evt_${uuidv4()}`
  },
  
  // Event Name
  name: {
    type: String,
    required: [true, 'Event name is required'],
    trim: true,
    index: true
  },
  
  // Event Type
  type: {
    type: String,
    required: [true, 'Event type is required'],
    enum: [
      // System Events
      'system:startup',
      'system:shutdown',
      'system:error',
      'system:warning',
      'system:info',
      'system:maintenance',
      'system:update',
      
      // User Events
      'user:created',
      'user:updated',
      'user:deleted',
      'user:logged_in',
      'user:logged_out',
      'user:password_changed',
      'user:email_verified',
      'user:phone_verified',
      'user:profile_updated',
      'user:preferences_updated',
      'user:role_changed',
      'user:account_locked',
      'user:account_unlocked',
      'user:account_suspended',
      'user:account_terminated',
      
      // Crop Events
      'crop:created',
      'crop:updated',
      'crop:deleted',
      'crop:status_changed',
      'crop:verified',
      'crop:rejected',
      'crop:harvested',
      'crop:sold',
      'crop:price_updated',
      'crop:quantity_updated',
      'crop:image_uploaded',
      'crop:certified',
      'crop:inspection_scheduled',
      'crop:inspection_completed',
      
      // Order & Transaction Events
      'order:created',
      'order:updated',
      'order:cancelled',
      'order:completed',
      'order:disputed',
      'order:dispute_resolved',
      'order:shipped',
      'order:delivered',
      'order:return_requested',
      'order:return_approved',
      'order:return_rejected',
      'order:refund_initiated',
      'order:refund_completed',
      'order:refund_failed',
      
      // Payment Events
      'payment:initiated',
      'payment:authorized',
      'payment:captured',
      'payment:failed',
      'payment:refunded',
      'payment:disputed',
      'payment:chargeback',
      'payment:recurring_created',
      'payment:recurring_updated',
      'payment:recurring_cancelled',
      
      // Blockchain Events
      'blockchain:transaction_created',
      'blockchain:transaction_signed',
      'blockchain:transaction_sent',
      'blockchain:transaction_confirmed',
      'blockchain:transaction_failed',
      'blockchain:contract_deployed',
      'blockchain:contract_updated',
      'blockchain:contract_interacted',
      'blockchain:oracle_updated',
      'blockchain:price_updated',
      'blockchain:event_emitted',
      
      // NFT Events
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
      
      // Notification Events
      'notification:sent',
      'notification:delivered',
      'notification:read',
      'notification:clicked',
      'notification:failed',
      'email:sent',
      'email:delivered',
      'email:opened',
      'email:clicked',
      'email:bounced',
      'email:complained',
      'sms:sent',
      'sms:delivered',
      'sms:failed',
      'push:sent',
      'push:received',
      'push:opened',
      'push:failed',
      
      // Webhook Events
      'webhook:created',
      'webhook:updated',
      'webhook:deleted',
      'webhook:enabled',
      'webhook:disabled',
      'webhook:delivery_attempted',
      'webhook:delivery_succeeded',
      'webhook:delivery_failed',
      'webhook:retry_scheduled',
      'webhook:retry_exhausted',
      
      // API Events
      'api:request',
      'api:response',
      'api:error',
      'api:rate_limit_exceeded',
      'api:authentication_failed',
      'api:authorization_failed',
      'api:validation_failed',
      'api:deprecated_endpoint',
      
      // Custom Events
      'custom:user_defined',
      'custom:integration',
      'custom:workflow',
      'custom:automation'
    ]
  },
  
  // Event Severity
  severity: {
    type: String,
    enum: ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'],
    default: 'info'
  },
  
  // Event Payload
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Event Source
  source: {
    type: String,
    required: [true, 'Event source is required'],
    trim: true
  },
  
  // Event Initiator
  initiator: {
    type: {
      type: String,
      enum: ['user', 'system', 'api', 'webhook', 'integration', 'cron', 'other'],
      required: [true, 'Initiator type is required']
    },
    id: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Initiator ID is required']
    },
    name: String,
    ip: String,
    userAgent: String
  },
  
  // Event Context
  context: {
    requestId: String,
    sessionId: String,
    correlationId: String,
    traceId: String,
    spanId: String,
    parentId: String,
    appVersion: String,
    environment: String,
    hostname: String,
    processId: String,
    userId: mongoose.Schema.Types.ObjectId,
    userRoles: [String],
    userPermissions: [String],
    tags: [String],
    custom: mongoose.Schema.Types.Mixed
  },
  
  // Event Expiration
  ttl: {
    type: Number, // in seconds
    default: 30 * 24 * 60 * 60 // 30 days
  },
  
  // Event Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'processed', 'failed', 'retrying', 'discarded'],
    default: 'pending',
    index: true
  },
  
  // Processing Information
  processing: {
    attempts: {
      type: Number,
      default: 0
    },
    maxAttempts: {
      type: Number,
      default: 3
    },
    lastAttemptAt: Date,
    nextAttemptAt: Date,
    lockedAt: Date,
    lockedBy: String,
    error: {
      name: String,
      message: String,
      code: String,
      stack: String,
      details: mongoose.Schema.Types.Mixed
    }
  },
  
  // Subscriptions
  subscriptions: [{
    type: {
      type: String,
      enum: ['webhook', 'email', 'sms', 'push', 'queue', 'function', 'other'],
      required: [true, 'Subscription type is required']
    },
    target: {
      type: String,
      required: [true, 'Subscription target is required']
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'delivered', 'failed', 'retrying', 'discarded'],
      default: 'pending'
    },
    attempts: {
      type: Number,
      default: 0
    },
    lastAttemptAt: Date,
    nextAttemptAt: Date,
    deliveredAt: Date,
    error: {
      name: String,
      message: String,
      code: String,
      stack: String,
      details: mongoose.Schema.Types.Mixed
    },
    metadata: mongoose.Schema.Types.Mixed,
    _id: false
  }],
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
    expires: 2592000 // 30 days in seconds
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Expiration
  expiresAt: {
    type: Date,
    index: true,
    expires: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
eventSchema.index({ name: 1, createdAt: -1 });
eventSchema.index({ type: 1, createdAt: -1 });
eventSchema.index({ 'initiator.id': 1, 'initiator.type': 1 });
eventSchema.index({ 'context.userId': 1 });
eventSchema.index({ 'context.correlationId': 1 });
eventSchema.index({ 'context.traceId': 1 });
eventSchema.index({ status: 1, 'processing.nextAttemptAt': 1 });

// Pre-save hook to set default values
eventSchema.pre('save', function(next) {
  // Set updatedAt timestamp
  this.updatedAt = new Date();
  
  // Set expiresAt based on TTL if not set
  if (!this.expiresAt && this.ttl) {
    this.expiresAt = new Date(Date.now() + this.ttl * 1000);
  }
  
  // Set default context values if not provided
  if (!this.context) {
    this.context = {};
  }
  
  if (!this.context.environment) {
    this.context.environment = process.env.NODE_ENV || 'development';
  }
  
  if (!this.context.appVersion) {
    this.context.appVersion = process.env.APP_VERSION || '1.0.0';
  }
  
  if (!this.context.hostname && typeof process !== 'undefined') {
    this.context.hostname = require('os').hostname();
  }
  
  if (!this.context.processId && typeof process !== 'undefined') {
    this.context.processId = String(process.pid);
  }
  
  next();
});

// Method to add a subscription
eventSchema.methods.addSubscription = function(type, target, metadata = {}) {
  const subscription = {
    type,
    target,
    status: 'pending',
    attempts: 0,
    metadata
  };
  
  this.subscriptions = this.subscriptions || [];
  this.subscriptions.push(subscription);
  
  return subscription;
};

// Method to update subscription status
eventSchema.methods.updateSubscription = function(index, update) {
  if (!this.subscriptions || !this.subscriptions[index]) {
    throw new Error('Subscription not found');
  }
  
  const subscription = this.subscriptions[index];
  
  // Update subscription fields
  Object.assign(subscription, update);
  
  // Update lastAttemptAt if status is changing
  if (update.status && update.status !== subscription.status) {
    subscription.lastAttemptAt = new Date();
    
    // Update deliveredAt if status is 'delivered'
    if (update.status === 'delivered') {
      subscription.deliveredAt = new Date();
    }
    
    // Increment attempts counter if this was a failed attempt
    if (update.status === 'failed' || update.status === 'retrying') {
      subscription.attempts = (subscription.attempts || 0) + 1;
    }
  }
  
  return subscription;
};

// Method to process the event
eventSchema.methods.process = async function(processorId) {
  if (this.status !== 'pending' && this.status !== 'retrying') {
    throw new Error(`Event cannot be processed in status: ${this.status}`);
  }
  
  // Lock the event for processing
  this.status = 'processing';
  this.processing.attempts = (this.processing.attempts || 0) + 1;
  this.processing.lastAttemptAt = new Date();
  this.processing.lockedAt = new Date();
  this.processing.lockedBy = processorId;
  
  await this.save();
  
  return this;
};

// Method to complete processing
eventSchema.methods.completeProcessing = async function() {
  if (this.status !== 'processing') {
    throw new Error(`Event is not being processed`);
  }
  
  this.status = 'processed';
  this.processing.lockedAt = undefined;
  this.processing.lockedBy = undefined;
  
  await this.save();
  
  return this;
};

// Method to fail processing
eventSchema.methods.failProcessing = async function(error, options = {}) {
  if (this.status !== 'processing') {
    throw new Error(`Event is not being processed`);
  }
  
  const { maxAttempts = 3, retryAfter = 60000 } = options;
  
  // Set error details
  this.processing.error = {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack,
    details: error.details
  };
  
  // Check if we should retry
  if (this.processing.attempts < maxAttempts) {
    this.status = 'retrying';
    this.processing.nextAttemptAt = new Date(Date.now() + retryAfter);
  } else {
    this.status = 'failed';
  }
  
  // Unlock the event
  this.processing.lockedAt = undefined;
  this.processing.lockedBy = undefined;
  
  await this.save();
  
  return this;
};

// Static method to find events ready for processing
eventSchema.statics.findReadyForProcessing = async function(limit = 100, processorId) {
  return this.find({
    $or: [
      { status: 'pending' },
      {
        status: 'retrying',
        'processing.nextAttemptAt': { $lte: new Date() }
      }
    ],
    $or: [
      { 'processing.lockedAt': { $exists: false } },
      { 'processing.lockedAt': { $lt: new Date(Date.now() - 5 * 60 * 1000) } } // 5 minute lock timeout
    ]
  })
  .sort({ 'processing.nextAttemptAt': 1, createdAt: 1 })
  .limit(limit)
  .lean();
};

// Static method to create a new event
eventSchema.statics.createEvent = async function({
  name,
  type,
  payload = {},
  source,
  initiator,
  context = {},
  ttl,
  metadata = {},
  subscriptions = []
}) {
  const event = new this({
    name,
    type,
    payload,
    source,
    initiator,
    context,
    ttl,
    metadata,
    subscriptions
  });
  
  await event.save();
  return event;
};

// Static method to get event statistics
eventSchema.statics.getStats = async function({
  startDate,
  endDate,
  groupBy = 'type',
  filter = {}
} = {}) {
  const match = { ...filter };
  
  // Apply date range
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  
  // Group by the specified field
  const groupField = `$${groupBy}`;
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: groupField,
        count: { $sum: 1 },
        firstOccurrence: { $min: '$createdAt' },
        lastOccurrence: { $max: '$createdAt' },
        byStatus: {
          $push: {
            status: '$status',
            count: 1
          }
        },
        bySeverity: {
          $push: {
            severity: '$severity',
            count: 1
          }
        },
        byInitiator: {
          $push: {
            initiator: '$initiator.type',
            count: 1
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        [groupBy]: '$_id',
        count: 1,
        firstOccurrence: 1,
        lastOccurrence: 1,
        byStatus: {
          $arrayToObject: {
            $map: {
              input: {
                $reduce: {
                  input: '$byStatus',
                  initialValue: [],
                  in: {
                    $concatArrays: [
                      '$$value',
                      {
                        $cond: [
                          { $in: ['$$this.status', '$$value.v'] },
                          [],
                          [{ k: '$$this.status', v: '$$this.status' }]
                        ]
                      }
                    ]
                  }
                }
              },
              as: 'status',
              in: {
                k: '$$status.v',
                v: {
                  $size: {
                    $filter: {
                      input: '$byStatus',
                      as: 's',
                      cond: { $eq: ['$$s.status', '$$status.v'] }
                    }
                  })
                }
              }
            }
          }
        },
        bySeverity: {
          $arrayToObject: {
            $map: {
              input: {
                $reduce: {
                  input: '$bySeverity',
                  initialValue: [],
                  in: {
                    $concatArrays: [
                      '$$value',
                      {
                        $cond: [
                          { $in: ['$$this.severity', '$$value.v'] },
                          [],
                          [{ k: '$$this.severity', v: '$$this.severity' }]
                        ]
                      }
                    ]
                  }
                }
              },
              as: 'severity',
              in: {
                k: '$$severity.v',
                v: {
                  $size: {
                    $filter: {
                      input: '$bySeverity',
                      as: 's',
                      cond: { $eq: ['$$s.severity', '$$severity.v'] }
                    }
                  })
                }
              }
            }
          }
        },
        byInitiator: {
          $arrayToObject: {
            $map: {
              input: {
                $reduce: {
                  input: '$byInitiator',
                  initialValue: [],
                  in: {
                    $concatArrays: [
                      '$$value',
                      {
                        $cond: [
                          { $in: ['$$this.initiator', '$$value.v'] },
                          [],
                          [{ k: '$$this.initiator', v: '$$this.initiator' }]
                        ]
                      }
                    ]
                  }
                }
              },
              as: 'initiator',
              in: {
                k: '$$initiator.v',
                v: {
                  $size: {
                    $filter: {
                      input: '$byInitiator',
                      as: 'i',
                      cond: { $eq: ['$$i.initiator', '$$initiator.v'] }
                    }
                  })
                }
              }
            }
          }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  return {
    total: stats.reduce((sum, stat) => sum + stat.count, 0),
    byGroup: stats,
    timeRange: {
      start: startDate ? new Date(startDate) : null,
      end: endDate ? new Date(endDate) : null
    }
  };
};

module.exports = mongoose.model('Event', eventSchema);
