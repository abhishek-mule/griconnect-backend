const mongoose = require('mongoose');

const paymentStatusSchema = new mongoose.Schema({
  // Reference to the payment
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: [true, 'Payment reference is required'],
    index: true
  },
  
  // Status information
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: [
      'created', 'pending', 'authorized', 'captured', 'failed',
      'refunded', 'partially_refunded', 'disputed', 'cancelled',
      'expired', 'processing', 'completed'
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
paymentStatusSchema.index({ payment: 1, createdAt: -1 });
paymentStatusSchema.index({ status: 1, createdAt: -1 });

// Pre-save hook to ensure required fields
paymentStatusSchema.pre('save', function(next) {
  if (!this.createdAt) {
    this.createdAt = new Date();
  }
  next();
});

// Static method to log a status change
paymentStatusSchema.statics.logStatusChange = async function(paymentId, status, {
  performedBy = null,
  reason = '',
  metadata = {},
  ipAddress = '',
  userAgent = ''
} = {}) {
  const statusLog = new this({
    payment: paymentId,
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

// Method to get status history for a payment
paymentStatusSchema.statics.getStatusHistory = async function(paymentId, {
  limit = 50,
  skip = 0,
  sort = { createdAt: -1 }
} = {}) {
  return this.find({ payment: paymentId })
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate('performedBy', 'name email')
    .lean();
};

// Method to get the current status of a payment
paymentStatusSchema.statics.getCurrentStatus = async function(paymentId) {
  const status = await this.findOne({ payment: paymentId })
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();
    
  return status ? status.status : null;
};

// Method to check if payment had a specific status
paymentStatusSchema.statics.hadStatus = async function(paymentId, status) {
  const count = await this.countDocuments({
    payment: paymentId,
    status: status
  });
  
  return count > 0;
};

// Method to get the first time a payment reached a specific status
paymentStatusSchema.statics.getFirstStatusOccurrence = async function(paymentId, status) {
  return this.findOne({
    payment: paymentId,
    status: status
  })
  .sort({ createdAt: 1 })
  .limit(1)
  .lean();
};

// Method to get the last time a payment had a specific status
paymentStatusSchema.statics.getLastStatusOccurrence = async function(paymentId, status) {
  return this.findOne({
    payment: paymentId,
    status: status
  })
  .sort({ createdAt: -1 })
  .limit(1)
  .lean();
};

// Method to get time spent in each status
paymentStatusSchema.statics.getTimeInStatuses = async function(paymentId) {
  // Get all status changes in chronological order
  const statusChanges = await this.find({ payment: paymentId })
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

module.exports = mongoose.model('PaymentStatus', paymentStatusSchema);
