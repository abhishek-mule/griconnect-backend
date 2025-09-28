const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const webhookSchema = new mongoose.Schema({
  // Webhook Identification
  webhookId: {
    type: String,
    unique: true,
    required: true,
    default: () => `wh_${uuidv4()}`
  },
  
  // Webhook Name
  name: {
    type: String,
    required: [true, 'Webhook name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  // Webhook Description
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // Webhook Owner
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Webhook owner is required'],
    index: true
  },
  
  // Target URL
  url: {
    type: String,
    required: [true, 'Webhook URL is required'],
    trim: true,
    validate: {
      validator: function(v) {
        try {
          new URL(v);
          return true;
        } catch (e) {
          return false;
        }
      },
      message: props => `${props.value} is not a valid URL!`
    }
  },
  
  // HTTP Method
  method: {
    type: String,
    enum: ['POST', 'PUT', 'PATCH'],
    default: 'POST'
  },
  
  // Authentication
  auth: {
    type: {
      // Basic Auth
      type: {
        type: String,
        enum: ['none', 'basic', 'bearer', 'api_key', 'custom'],
        default: 'none'
      },
      
      // Basic Auth
      username: String,
      password: {
        type: String,
        select: false
      },
      
      // Bearer Token
      token: {
        type: String,
        select: false
      },
      
      // API Key
      apiKey: {
        type: String,
        select: false
      },
      apiKeyHeader: String,
      
      // Custom Headers
      headers: [{
        name: String,
        value: String,
        _id: false
      }]
    },
    default: { type: 'none' }
  },
  
  // Events to listen for
  events: [{
    type: String,
    required: [true, 'At least one event is required'],
    enum: [
      // User Events
      'user.created',
      'user.updated',
      'user.deleted',
      'user.logged_in',
      'user.logged_out',
      'user.password_changed',
      'user.verified',
      
      // Crop Events
      'crop.created',
      'crop.updated',
      'crop.deleted',
      'crop.status_changed',
      'crop.verified',
      'crop.rejected',
      'crop.harvested',
      'crop.sold',
      'crop.price_updated',
      'crop.quantity_updated',
      
      // Order & Transaction Events
      'order.created',
      'order.updated',
      'order.cancelled',
      'order.completed',
      'payment.initiated',
      'payment.completed',
      'payment.failed',
      'refund.initiated',
      'refund.completed',
      'refund.failed',
      'withdrawal.requested',
      'withdrawal.processed',
      'withdrawal.failed',
      
      // Blockchain Events
      'blockchain.transaction_sent',
      'blockchain.transaction_confirmed',
      'blockchain.transaction_failed',
      'nft.minted',
      'nft.transferred',
      'nft.burned',
      'smart_contract.deployed',
      'smart_contract.updated',
      'oracle.updated',
      
      // System Events
      'system.alert',
      'system.warning',
      'system.error',
      'system.maintenance',
      'system.update',
      
      // Custom Events
      'custom.*',
      '*'
    ]
  }],
  
  // Webhook Secret (for HMAC signature)
  secret: {
    type: String,
    select: false,
    default: () => `whsec_${crypto.randomBytes(32).toString('hex')}`
  },
  
  // Webhook Status
  status: {
    type: String,
    enum: ['active', 'paused', 'disabled'],
    default: 'active',
    index: true
  },
  
  // Rate Limiting
  rateLimit: {
    enabled: {
      type: Boolean,
      default: true
    },
    windowMs: {
      type: Number,
      default: 60 * 1000, // 1 minute
      min: 1000, // 1 second
      max: 60 * 60 * 1000 // 1 hour
    },
    max: {
      type: Number,
      default: 60, // 60 requests per windowMs
      min: 1,
      max: 1000
    }
  },
  
  // Retry Configuration
  retry: {
    enabled: {
      type: Boolean,
      default: true
    },
    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
      max: 10
    },
    initialDelayMs: {
      type: Number,
      default: 1000, // 1 second
      min: 100,
      max: 60 * 1000 // 1 minute
    },
    maxDelayMs: {
      type: Number,
      default: 60 * 1000, // 1 minute
      min: 1000, // 1 second
      max: 24 * 60 * 60 * 1000 // 1 day
    },
    factor: {
      type: Number,
      default: 2,
      min: 1,
      max: 10
    }
  },
  
  // Webhook Statistics
  stats: {
    totalDeliveries: {
      type: Number,
      default: 0
    },
    successfulDeliveries: {
      type: Number,
      default: 0
    },
    failedDeliveries: {
      type: Number,
      default: 0
    },
    lastDeliveryAt: Date,
    lastSuccessAt: Date,
    lastFailureAt: Date,
    lastFailureReason: String
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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
  
  // Expiration
  expiresAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
webhookSchema.index({ user: 1, status: 1 });
webhookSchema.index({ 'events': 1 });
webhookSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for webhook deliveries
webhookSchema.virtual('deliveries', {
  ref: 'WebhookDelivery',
  localField: '_id',
  foreignField: 'webhook',
  justOne: false
});

// Pre-save hook to update timestamps and validate data
webhookSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Ensure events array is unique
  if (this.events && Array.isArray(this.events)) {
    this.events = [...new Set(this.events)];
  }
  
  // If webhook is disabled, ensure it's not active
  if (this.status === 'disabled') {
    this.status = 'disabled';
  }
  
  next();
});

// Method to check if webhook is active
webhookSchema.methods.isActive = function() {
  return this.status === 'active' && 
         (!this.expiresAt || this.expiresAt > new Date());
};

// Method to check if webhook is subscribed to an event
webhookSchema.methods.isSubscribedTo = function(eventName) {
  if (!eventName || typeof eventName !== 'string') return false;
  
  // Check for exact match or wildcard
  return this.events.some(e => {
    if (e === '*' || e === 'custom.*') return true;
    if (e === eventName) return true;
    
    // Handle wildcard patterns like 'user.*'
    if (e.endsWith('.*')) {
      const prefix = e.slice(0, -2);
      return eventName === prefix || eventName.startsWith(prefix + '.');
    }
    
    return false;
  });
};

// Method to generate HMAC signature for webhook payload
webhookSchema.methods.generateSignature = function(payload) {
  if (!this.secret) return null;
  
  const hmac = crypto.createHmac('sha256', this.secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
};

// Method to verify HMAC signature
webhookSchema.methods.verifySignature = function(signature, payload) {
  if (!this.secret || !signature) return false;
  
  const expectedSignature = this.generateSignature(payload);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

// Method to update webhook statistics
webhookSchema.methods.updateStats = async function(deliveryStatus, failureReason = null) {
  const update = {
    $inc: {
      'stats.totalDeliveries': 1,
      [`stats.${deliveryStatus}Deliveries`]: 1
    },
    $set: {
      'stats.lastDeliveryAt': new Date(),
      [`stats.last${deliveryStatus === 'successful' ? 'Success' : 'Failure'}At`]: new Date()
    }
  };
  
  if (failureReason) {
    update.$set['stats.lastFailureReason'] = failureReason;
  }
  
  return this.updateOne(update);
};

// Static method to find active webhooks for an event
webhookSchema.statics.findActiveForEvent = async function(eventName, options = {}) {
  // Find all active webhooks that are subscribed to this event
  const webhooks = await this.find({
    status: 'active',
    $or: [
      { events: eventName },
      { events: '*' },
      { events: `${eventName.split('.')[0]}.*` }
    ],
    ...(options.userId && { user: options.userId })
  });
  
  // Filter webhooks that are actually subscribed to this event
  return webhooks.filter(webhook => webhook.isSubscribedTo(eventName));
};

// Static method to create a test webhook
webhookSchema.statics.createTestWebhook = async function(userId, url) {
  const webhook = new this({
    name: 'Test Webhook',
    description: 'Test webhook for development and testing',
    user: userId,
    url: url || 'https://webhook.site/',
    events: ['*'],
    status: 'active',
    metadata: {
      isTest: true,
      createdBy: 'system'
    }
  });
  
  await webhook.save();
  return webhook;
};

module.exports = mongoose.model('Webhook', webhookSchema);
