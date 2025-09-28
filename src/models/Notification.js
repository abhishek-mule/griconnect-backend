const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const notificationSchema = new mongoose.Schema({
  // Notification Identification
  notificationId: {
    type: String,
    unique: true,
    required: true,
    default: () => `NOTIF_${Date.now()}_${uuidv4().substr(0, 8)}`
  },
  
  // Recipient
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient user is required'],
    index: true
  },
  
  // Sender (optional, could be system or another user)
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Notification Type
  type: {
    type: String,
    required: [true, 'Notification type is required'],
    enum: [
      // System Notifications
      'system_alert',
      'system_update',
      'system_maintenance',
      
      // User Notifications
      'welcome',
      'email_verification',
      'password_reset',
      'profile_updated',
      'settings_updated',
      
      // Transaction Notifications
      'payment_received',
      'payment_sent',
      'payment_failed',
      'refund_processed',
      'refund_failed',
      'withdrawal_requested',
      'withdrawal_processed',
      'withdrawal_failed',
      
      // Crop Notifications
      'crop_listed',
      'crop_sold',
      'crop_price_updated',
      'crop_verified',
      'crop_rejected',
      'crop_expiring_soon',
      'crop_harvest_reminder',
      
      // Order Notifications
      'order_placed',
      'order_confirmed',
      'order_shipped',
      'order_delivered',
      'order_cancelled',
      'order_disputed',
      
      // Review Notifications
      'review_received',
      'review_replied',
      'review_helpful',
      
      // Support Notifications
      'ticket_created',
      'ticket_updated',
      'ticket_closed',
      'ticket_replied',
      
      // Community Notifications
      'followed',
      'mentioned',
      'new_follower',
      'new_message',
      'comment_on_post',
      'like_on_post',
      'share_on_post',
      
      // Marketing Notifications
      'promotion',
      'newsletter',
      'announcement',
      'event_reminder',
      
      // Security Notifications
      'login_alert',
      'suspicious_activity',
      'password_changed',
      'two_factor_enabled',
      'two_factor_disabled',
      'device_authorized',
      'new_device',
      'account_locked',
      'account_unlocked',
      
      // Custom Notifications
      'custom'
    ]
  },
  
  // Notification Content
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  
  // Rich Content (optional)
  content: {
    html: String,
    markdown: String,
    text: String
  },
  
  // Action Buttons
  actions: [{
    text: {
      type: String,
      required: [true, 'Button text is required']
    },
    url: String,
    action: String, // e.g., 'view_order', 'reply', 'dismiss'
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      default: 'GET'
    },
    primary: {
      type: Boolean,
      default: false
    }
  }],
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Read Status
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  
  readAt: Date,
  
  // Delivery Status
  delivered: {
    type: Boolean,
    default: false,
    index: true
  },
  
  deliveredAt: Date,
  
  // Delivery Channels
  channels: {
    inApp: {
      type: Boolean,
      default: true
    },
    email: {
      type: Boolean,
      default: false
    },
    sms: {
      type: Boolean,
      default: false
    },
    push: {
      type: Boolean,
      default: false
    },
    webhook: {
      type: Boolean,
      default: false
    }
  },
  
  // Related Entities
  relatedTo: {
    type: String,
    enum: [
      'user', 'crop', 'order', 'payment', 'refund', 
      'ticket', 'review', 'post', 'comment', 'none'
    ],
    default: 'none'
  },
  
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedTo',
    default: null
  },
  
  // Metadata
  metadata: mongoose.Schema.Types.Mixed,
  
  // Expiration
  expiresAt: {
    type: Date,
    index: { expires: 0 } // TTL index for auto-deletion
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
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
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ 'channels.email': 1, delivered: 1 });
notificationSchema.index({ 'channels.sms': 1, delivered: 1 });
notificationSchema.index({ 'channels.push': 1, delivered: 1 });

// Pre-save hook to set default expiration (30 days from creation)
notificationSchema.pre('save', function(next) {
  if (!this.expiresAt) {
    const expiresInDays = 30; // Default expiration in days
    this.expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  }
  next();
});

// Method to mark as read
notificationSchema.methods.markAsRead = async function() {
  if (!this.read) {
    this.read = true;
    this.readAt = new Date();
    await this.save();
  }
  return this;
};

// Method to mark as delivered
notificationSchema.methods.markAsDelivered = async function(channel) {
  if (channel && this.channels[channel] !== undefined) {
    this.channels[channel] = true;
    
    // Check if all enabled channels have delivered
    const allDelivered = Object.entries(this.channels)
      .filter(([ch, enabled]) => enabled && ch !== 'inApp')
      .every(([ch, enabled]) => this.channels[ch]);
    
    if (allDelivered) {
      this.delivered = true;
      this.deliveredAt = new Date();
    }
    
    await this.save();
  }
  return this;
};

// Static method to create a notification
notificationSchema.statics.createNotification = async function({
  user,
  type,
  title,
  message,
  content,
  actions = [],
  priority = 'normal',
  channels = { inApp: true },
  relatedTo = 'none',
  relatedId = null,
  metadata = {},
  expiresInDays = 30
}) {
  const notification = new this({
    user,
    type,
    title,
    message,
    content,
    actions,
    priority,
    channels,
    relatedTo,
    relatedId,
    metadata,
    expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
  });
  
  await notification.save();
  return notification;
};

// Static method to get unread notifications count for a user
notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({
    user: userId,
    read: false
  });
};

// Static method to mark all notifications as read for a user
notificationSchema.statics.markAllAsRead = async function(userId) {
  const result = await this.updateMany(
    { user: userId, read: false },
    { 
      $set: { 
        read: true,
        readAt: new Date() 
      } 
    }
  );
  
  return result.modifiedCount;
};

// Static method to get notifications with pagination
notificationSchema.statics.getUserNotifications = async function(userId, {
  page = 1,
  limit = 20,
  read = null,
  type = null,
  sort = '-createdAt'
} = {}) {
  const query = { user: userId };
  
  if (read !== null) {
    query.read = read;
  }
  
  if (type) {
    query.type = type;
  }
  
  const options = {
    page: parseInt(page, 10) || 1,
    limit: parseInt(limit, 10) || 20,
    sort,
    lean: true,
    leanWithId: false
  };
  
  // Use pagination if needed, or simple find
  if (options.page > 0) {
    return this.paginate(query, options);
  } else {
    const result = await this.find(query)
      .sort(sort)
      .limit(options.limit)
      .lean();
    
    return {
      docs: result,
      total: result.length,
      limit: options.limit,
      page: 1,
      pages: 1
    };
  }
};

module.exports = mongoose.model('Notification', notificationSchema);
