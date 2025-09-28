const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const refundSchema = new mongoose.Schema({
  // Refund Identification
  refundId: {
    type: String,
    unique: true,
    required: true,
    default: () => `REF_${Date.now()}_${uuidv4().substr(0, 8)}`
  },
  
  // Payment Reference
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: [true, 'Payment reference is required']
  },
  
  // Refund Details
  amount: {
    type: Number,
    required: [true, 'Refund amount is required'],
    min: [0.01, 'Amount must be greater than 0']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    enum: ['INR', 'USD', 'EUR', 'MATIC', 'ETH'],
    default: 'INR'
  },
  
  // Refund Method
  method: {
    type: String,
    enum: ['original', 'bank_transfer', 'wallet', 'manual', 'other'],
    default: 'original'
  },
  
  // Refund Destination
  destination: {
    type: String,
    required: [
      function() { 
        return this.method !== 'original'; 
      }, 
      'Destination is required for non-original refunds'
    ]
  },
  
  // Status
  status: {
    type: String,
    enum: [
      'pending',      // Refund requested
      'processing',   // Refund in progress
      'processed',    // Refund completed successfully
      'failed',       // Refund failed
      'cancelled'     // Refund cancelled
    ],
    default: 'pending'
  },
  
  // Reason for Refund
  reason: {
    type: String,
    maxlength: [1000, 'Reason cannot exceed 1000 characters']
  },
  
  // Gateway/Processor Details
  processor: {
    type: String,
    enum: ['razorpay', 'stripe', 'coinbase', 'manual', 'blockchain', null],
    default: null
  },
  
  processorRefundId: String,
  processorResponse: mongoose.Schema.Types.Mixed,
  
  // For Crypto Refunds
  cryptoDetails: {
    transactionHash: String,
    fromAddress: String,
    toAddress: String,
    network: {
      type: String,
      enum: ['ethereum', 'polygon', 'binance', 'solana', null],
      default: 'polygon'
    },
    blockNumber: Number,
    confirmations: {
      type: Number,
      default: 0
    },
    gasUsed: Number,
    gasPrice: Number
  },
  
  // For Bank Transfers
  bankDetails: {
    accountNumber: String,
    accountHolderName: String,
    ifscCode: String,
    bankName: String,
    branch: String,
    reference: String
  },
  
  // For UPI Refunds
  upiDetails: {
    vpa: String,
    reference: String
  },
  
  // Metadata
  notes: String,
  metadata: mongoose.Schema.Types.Mixed,
  
  // Audit Trail
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Initiator is required']
  },
  
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [
      function() { 
        return ['processed', 'failed'].includes(this.status); 
      }, 
      'Processor is required for processed or failed refunds'
    ]
  },
  
  // Timestamps
  processedAt: Date,
  cancelledAt: Date,
  failedAt: Date,
  failureReason: String,
  
  // System Fields
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
refundSchema.index({ refundId: 1 });
refundSchema.index({ payment: 1 });
refundSchema.index({ initiatedBy: 1 });
refundSchema.index({ status: 1, createdAt: -1 });
refundSchema.index({ 'cryptoDetails.transactionHash': 1 }, { sparse: true });
refundSchema.index({ 'processorRefundId': 1 }, { sparse: true });

// Pre-save hook to update timestamps
refundSchema.pre('save', function(next) {
  const now = new Date();
  this.updatedAt = now;
  
  // Update status timestamps
  if (this.isModified('status')) {
    const status = this.status;
    const timestamp = now;
    
    if (status === 'processed') {
      this.processedAt = this.processedAt || timestamp;
    } else if (status === 'failed') {
      this.failedAt = this.failedAt || timestamp;
    } else if (status === 'cancelled') {
      this.cancelledAt = this.cancelledAt || timestamp;
    }
  }
  
  next();
});

// Virtual for refund status history
refundSchema.virtual('statusHistory', {
  ref: 'RefundStatus',
  localField: '_id',
  foreignField: 'refund',
  justOne: false
});

// Method to check if refund can be processed
refundSchema.methods.canProcess = async function() {
  if (this.status !== 'pending') {
    return false;
  }
  
  // Check if payment is still refundable
  const Payment = mongoose.model('Payment');
  const payment = await Payment.findById(this.payment);
  
  if (!payment) {
    throw new Error('Associated payment not found');
  }
  
  return payment.isRefundable() && 
         (await payment.getRefundableAmount()) >= this.amount;
};

// Method to process the refund
refundSchema.methods.process = async function(processorId, notes = '') {
  if (!await this.canProcess()) {
    throw new Error('Refund cannot be processed in the current state');
  }
  
  // In a real implementation, this would interface with the payment processor
  // For now, we'll simulate a successful processing
  this.status = 'processed';
  this.processedBy = processorId;
  this.notes = notes;
  
  await this.save();
  
  // Update payment status if fully refunded
  const Payment = mongoose.model('Payment');
  const payment = await Payment.findById(this.payment);
  const refundableAmount = await payment.getRefundableAmount();
  
  if (this.amount >= refundableAmount) {
    payment.status = 'refunded';
  } else {
    payment.status = 'partially_refunded';
  }
  
  await payment.save();
  
  return this;
};

// Method to fail the refund
refundSchema.methods.fail = async function(reason = '') {
  if (this.status !== 'pending') {
    throw new Error('Only pending refunds can be marked as failed');
  }
  
  this.status = 'failed';
  this.failureReason = reason;
  this.processedBy = this.processedBy || this.initiatedBy;
  
  await this.save();
  
  return this;
};

// Method to cancel the refund
refundSchema.methods.cancel = async function(reason = '') {
  if (!['pending', 'processing'].includes(this.status)) {
    throw new Error('Only pending or processing refunds can be cancelled');
  }
  
  this.status = 'cancelled';
  this.failureReason = reason || 'Cancelled by user';
  this.processedBy = this.processedBy || this.initiatedBy;
  
  await this.save();
  
  return this;
};

module.exports = mongoose.model('Refund', refundSchema);
