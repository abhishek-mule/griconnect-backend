const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const paymentSchema = new mongoose.Schema({
  // Payment Identification
  paymentId: {
    type: String,
    unique: true,
    required: true,
    default: () => `PAY_${Date.now()}_${uuidv4().substr(0, 8)}`
  },
  orderId: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Payment Details
  amount: {
    type: Number,
    required: [true, 'Please add an amount'],
    min: [0.01, 'Amount must be greater than 0']
  },
  currency: {
    type: String,
    required: [true, 'Please specify currency'],
    enum: ['INR', 'USD', 'EUR', 'MATIC', 'ETH'],
    default: 'INR'
  },
  paymentMethod: {
    type: String,
    required: [true, 'Please specify payment method'],
    enum: ['upi', 'card', 'netbanking', 'wallet', 'crypto', 'bank-transfer', 'cod'],
    default: 'upi'
  },
  paymentGateway: {
    type: String,
    enum: ['razorpay', 'stripe', 'coinbase', 'manual', 'blockchain', null],
    default: null
  },
  
  // Fiat Payment Details
  fiatDetails: {
    gatewayPaymentId: String,
    gatewayOrderId: String,
    method: String,
    bank: String,
    wallet: String,
    vpa: String,
    cardId: String,
    bankTransactionId: String,
    tax: Number,
    fee: Number,
    currencyConversionRate: Number,
    receipt: String
  },
  
  // Crypto Payment Details
  cryptoDetails: {
    transactionHash: String,
    fromAddress: String,
    toAddress: String,
    cryptoAmount: Number,
    cryptoCurrency: {
      type: String,
      enum: ['MATIC', 'ETH', 'USDC', 'USDT', 'DAI', 'WBTC', null],
      default: null
    },
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
    gasPrice: Number,
    nonce: Number
  },
  
  // Payment Status
  status: {
    type: String,
    enum: [
      'created',       // Payment created
      'pending',       // Payment initiated, waiting for confirmation
      'authorized',    // Payment authorized (for cards)
      'captured',      // Payment captured
      'failed',        // Payment failed
      'refunded',      // Payment refunded
      'partially_refunded', // Partially refunded
      'disputed',      // Payment disputed
      'cancelled',     // Payment cancelled
      'expired',       // Payment expired
      'processing',    // Payment is being processed
      'completed'      // Payment completed successfully
    ],
    default: 'created'
  },
  
  // Related Entities
  payer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Please add a payer']
  },
  payee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Please add a payee']
  },
  crop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Crop',
    required: [true, 'Please add a crop']
  },
  
  // Order Details
  order: {
    items: [{
      crop: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Crop',
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: [0.01, 'Quantity must be greater than 0']
      },
      unitPrice: {
        type: Number,
        required: true,
        min: [0, 'Price cannot be negative']
      },
      subtotal: {
        type: Number,
        required: true,
        min: [0, 'Subtotal cannot be negative']
      },
      discount: {
        type: Number,
        default: 0
      },
      total: {
        type: Number,
        required: true,
        min: [0, 'Total cannot be negative']
      },
      currency: {
        type: String,
        required: true,
        enum: ['INR', 'USD', 'EUR', 'MATIC', 'ETH']
      }
    }],
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'Subtotal cannot be negative']
    },
    tax: {
      type: Number,
      default: 0
    },
    shipping: {
      type: Number,
      default: 0
    },
    discount: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      required: true,
      min: [0, 'Total cannot be negative']
    },
    currency: {
      type: String,
      required: true,
      enum: ['INR', 'USD', 'EUR', 'MATIC', 'ETH']
    },
    notes: String
  },
  
  // Shipping Details
  shipping: {
    name: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String,
      coordinates: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: [Number]
      }
    },
    contact: {
      phone: String,
      email: String
    },
    method: String,
    trackingNumber: String,
    carrier: String,
    estimatedDelivery: Date,
    deliveredAt: Date
  },
  
  // Metadata
  metadata: {
    ipAddress: String,
    userAgent: String,
    deviceId: String,
    referrer: String,
    utmSource: String,
    utmMedium: String,
    utmCampaign: String,
    utmTerm: String,
    utmContent: String
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
  expiresAt: Date,
  paidAt: Date,
  refundedAt: Date,
  cancelledAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
paymentSchema.index({ paymentId: 1 });
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ payer: 1, status: 1 });
paymentSchema.index({ payee: 1, status: 1 });
paymentSchema.index({ 'cryptoDetails.transactionHash': 1 }, { sparse: true });
paymentSchema.index({ 'fiatDetails.gatewayPaymentId': 1 }, { sparse: true });
paymentSchema.index({ 'fiatDetails.gatewayOrderId': 1 }, { sparse: true });
paymentSchema.index({ status: 1, createdAt: -1 });

// Virtual for payment status history
paymentSchema.virtual('statusHistory', {
  ref: 'PaymentStatus',
  localField: '_id',
  foreignField: 'payment',
  justOne: false
});

// Virtual for refunds
paymentSchema.virtual('refunds', {
  ref: 'Refund',
  localField: '_id',
  foreignField: 'payment',
  justOne: false
});

// Pre-save hook to update timestamps
paymentSchema.pre('save', function(next) {
  const now = new Date();
  this.updatedAt = now;
  
  // Set default expiry (24 hours from creation)
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
  
  // Update status timestamps
  if (this.isModified('status')) {
    const status = this.status;
    const timestamp = now;
    
    if (status === 'completed' || status === 'captured') {
      this.paidAt = this.paidAt || timestamp;
    } else if (status === 'refunded' || status === 'partially_refunded') {
      this.refundedAt = this.refundedAt || timestamp;
    } else if (status === 'cancelled') {
      this.cancelledAt = this.cancelledAt || timestamp;
    }
  }
  
  next();
});

// Method to check if payment is expired
paymentSchema.methods.isExpired = function() {
  return this.expiresAt && new Date() > this.expiresAt;
};

// Method to check if payment is refundable
paymentSchema.methods.isRefundable = function() {
  return ['completed', 'captured'].includes(this.status) && 
         !['refunded', 'partially_refunded', 'disputed'].includes(this.status);
};

// Method to get refundable amount
paymentSchema.methods.getRefundableAmount = async function() {
  if (!this.isRefundable()) {
    return 0;
  }
  
  // Get total refunded amount
  const Refund = mongoose.model('Refund');
  const refunds = await Refund.find({ 
    payment: this._id, 
    status: 'processed' 
  });
  
  const totalRefunded = refunds.reduce((sum, refund) => sum + refund.amount, 0);
  return this.amount - totalRefunded;
};

// Method to create a refund
paymentSchema.methods.createRefund = async function(amount, reason = '') {
  if (!this.isRefundable()) {
    throw new Error('Payment is not refundable');
  }
  
  const refundableAmount = await this.getRefundableAmount();
  
  if (amount > refundableAmount) {
    throw new Error(`Refund amount (${amount}) exceeds refundable amount (${refundableAmount})`);
  }
  
  const Refund = mongoose.model('Refund');
  const refund = new Refund({
    payment: this._id,
    amount,
    currency: this.currency,
    reason,
    status: 'pending',
    initiatedBy: this.payer,
    processedBy: this.payee
  });
  
  await refund.save();
  
  // Update payment status if fully refunded
  if (amount === refundableAmount) {
    this.status = 'refunded';
  } else {
    this.status = 'partially_refunded';
  }
  
  await this.save();
  
  return refund;
};

// Static method to get payment summary
paymentSchema.statics.getSummary = async function(userId, timeframe = 'month') {
  const now = new Date();
  let startDate;
  
  switch (timeframe) {
    case 'day':
      startDate = new Date(now.setDate(now.getDate() - 1));
      break;
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case 'month':
    default:
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case 'year':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
  }
  
  const match = {
    $or: [
      { payer: userId },
      { payee: userId }
    ],
    status: { $in: ['completed', 'captured'] },
    createdAt: { $gte: startDate }
  };
  
  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalPayments: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        currency: { $first: '$currency' },
        received: {
          $sum: {
            $cond: [{ $eq: ['$payee', userId] }, '$amount', 0]
          }
        },
        sent: {
          $sum: {
            $cond: [{ $eq: ['$payer', userId] }, '$amount', 0]
          }
        },
        byMethod: {
          $push: {
            method: '$paymentMethod',
            amount: '$amount',
            count: 1
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalPayments: 1,
        totalAmount: 1,
        currency: 1,
        received: 1,
        sent: 1,
        net: { $subtract: ['$received', '$sent'] },
        byMethod: {
          $reduce: {
            input: '$byMethod',
            initialValue: [],
            in: {
              $let: {
                vars: {
                  existing: {
                    $filter: {
                      input: '$$value',
                      as: 'item',
                      cond: { $eq: ['$$item.method', '$$this.method'] }
                    }
                  }
                },
                in: {
                  $concatArrays: [
                    { $filter: { input: '$$value', as: 'item', cond: { $ne: ['$$item.method', '$$this.method'] } } },
                    [{
                      method: '$$this.method',
                      amount: { $sum: ['$$this.amount', { $ifNull: [{ $arrayElemAt: ['$$existing.amount', 0] }, 0] }] },
                      count: { $sum: ['$$this.count', { $ifNull: [{ $arrayElemAt: ['$$existing.count', 0] }, 0] }] }
                    }]
                  ]
                }
              }
            }
          }
        }
      }
    }
  ]);
  
  return result[0] || {
    totalPayments: 0,
    totalAmount: 0,
    currency: 'INR',
    received: 0,
    sent: 0,
    net: 0,
    byMethod: []
  };
};

module.exports = mongoose.model('Payment', paymentSchema);
