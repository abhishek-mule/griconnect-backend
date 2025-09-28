const mongoose = require('mongoose');

const refundStatusSchema = new mongoose.Schema({
  // Reference to the refund
  refund: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Refund',
    required: [true, 'Refund reference is required'],
    index: true
  },
  
  // Status information
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: [
      'pending',      // Refund requested
      'processing',   // Refund in progress
      'processed',    // Refund completed successfully
      'failed',       // Refund failed
      'cancelled'     // Refund cancelled
    ]
  },
  
  // Status change details
  reason: String,
  metadata: mongoose.Schema.Types.Mixed,
  
  // Performed by (user or system)
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // IP address of the requester
  ipAddress: String,
  
  // User agent of the requester
  userAgent: String,
  
  // Timestamp
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for faster lookups
refundStatusSchema.index({ refund: 1, createdAt: -1 });
refundStatusSchema.index({ status: 1, createdAt: -1 });

// Pre-save hook to ensure required fields
refundStatusSchema.pre('save', function(next) {
  if (!this.createdAt) {
    this.createdAt = new Date();
  }
  next();
});

// Static method to log a status change
refundStatusSchema.statics.logStatusChange = async function(refundId, status, {
  performedBy = null,
  reason = '',
  metadata = {},
  ipAddress = '',
  userAgent = ''
} = {}) {
  const statusLog = new this({
    refund: refundId,
    status,
    reason,
    metadata,
    performedBy,
    ipAddress,
    userAgent
  });
  
  await statusLog.save();
  return statusLog;
};

// Method to get status history for a refund
refundStatusSchema.statics.getStatusHistory = async function(refundId, {
  limit = 50,
  skip = 0,
  sort = { createdAt: -1 }
} = {}) {
  return this.find({ refund: refundId })
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate('performedBy', 'name email')
    .lean();
};

// Method to get the current status of a refund
refundStatusSchema.statics.getCurrentStatus = async function(refundId) {
  const status = await this.findOne({ refund: refundId })
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();
    
  return status ? status.status : null;
};

// Method to check if refund had a specific status
refundStatusSchema.statics.hadStatus = async function(refundId, status) {
  const count = await this.countDocuments({
    refund: refundId,
    status: status
  });
  
  return count > 0;
};

// Method to get the first time a refund reached a specific status
refundStatusSchema.statics.getFirstStatusOccurrence = async function(refundId, status) {
  return this.findOne({
    refund: refundId,
    status: status
  })
  .sort({ createdAt: 1 })
  .limit(1)
  .lean();
};

// Method to get the last time a refund had a specific status
refundStatusSchema.statics.getLastStatusOccurrence = async function(refundId, status) {
  return this.findOne({
    refund: refundId,
    status: status
  })
  .sort({ createdAt: -1 })
  .limit(1)
  .lean();
};

// Method to get time spent in each status
refundStatusSchema.statics.getTimeInStatuses = async function(refundId) {
  // Get all status changes in chronological order
  const statusChanges = await this.find({ refund: refundId })
    .sort({ createdAt: 1 })
    .lean();
    
  if (statusChanges.length === 0) {
    return [];
  }
  
  const now = new Date();
  const result = [];
  
  // Calculate time spent in each status
  for (let i = 0; i < statusChanges.length; i++) {
    const current = statusChanges[i];
    const next = statusChanges[i + 1];
    
    const startTime = current.createdAt;
    const endTime = next ? next.createdAt : now;
    const durationMs = endTime - startTime;
    
    // Convert milliseconds to hours, minutes, seconds
    const duration = {
      milliseconds: durationMs,
      seconds: Math.floor(durationMs / 1000) % 60,
      minutes: Math.floor(durationMs / (1000 * 60)) % 60,
      hours: Math.floor(durationMs / (1000 * 60 * 60)) % 24,
      days: Math.floor(durationMs / (1000 * 60 * 60 * 24)),
      humanReadable: ''
    };
    
    // Create human-readable duration
    const parts = [];
    if (duration.days > 0) parts.push(`${duration.days}d`);
    if (duration.hours > 0) parts.push(`${duration.hours}h`);
    if (duration.minutes > 0) parts.push(`${duration.minutes}m`);
    if (duration.seconds > 0 || parts.length === 0) parts.push(`${duration.seconds}s`);
    
    duration.humanReadable = parts.join(' ');
    
    result.push({
      status: current.status,
      from: startTime,
      to: endTime,
      duration,
      performedBy: current.performedBy,
      reason: current.reason
    });
  }
  
  return result;
};

module.exports = mongoose.model('RefundStatus', refundStatusSchema);
