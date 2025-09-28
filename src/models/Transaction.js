const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const transactionSchema = new mongoose.Schema({
  // Transaction Identification
  transactionId: {
    type: String,
    unique: true,
    required: true,
    default: () => `TXN_${Date.now()}_${uuidv4().substr(0, 8)}`
  },
  
  // Blockchain Network
  network: {
    type: String,
    required: [true, 'Blockchain network is required'],
    enum: ['ethereum', 'polygon', 'binance', 'solana', 'other'],
    default: 'polygon'
  },
  
  // Transaction Type
  type: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: [
      'token_transfer',  // Standard token transfer
      'nft_mint',       // NFT minting
      'nft_transfer',   // NFT transfer
      'contract_call',  // Smart contract interaction
      'payment',        // Payment processing
      'refund',         // Refund processing
      'other'           // Other transaction types
    ]
  },
  
  // Transaction Details
  hash: {
    type: String,
    required: [
      function() { return this.status === 'confirmed' || this.status === 'pending'; },
      'Transaction hash is required for confirmed or pending transactions'
    ],
    index: true
  },
  
  fromAddress: {
    type: String,
    required: [true, 'Sender address is required'],
    index: true
  },
  
  toAddress: {
    type: String,
    required: [
      function() { 
        return this.type !== 'contract_call' && this.type !== 'other';
      },
      'Recipient address is required for this transaction type'
    ],
    index: true
  },
  
  // For token transfers
  tokenAddress: {
    type: String,
    index: true
  },
  
  tokenSymbol: String,
  tokenName: String,
  tokenDecimals: {
    type: Number,
    default: 18
  },
  
  // Amount in the smallest unit (wei, satoshis, etc.)
  amount: {
    type: String,
    required: [
      function() { 
        return this.type === 'token_transfer' || this.type === 'payment' || this.type === 'refund';
      },
      'Amount is required for this transaction type'
    ]
  },
  
  // Human-readable amount (converted from smallest unit)
  displayAmount: Number,
  
  // For NFT transactions
  tokenId: String,
  tokenURI: String,
  
  // For contract calls
  contractAddress: String,
  functionName: String,
  functionArgs: mongoose.Schema.Types.Mixed,
  
  // Gas and Fees
  gasPrice: String,
  gasUsed: Number,
  gasLimit: Number,
  effectiveGasPrice: String,
  maxFeePerGas: String,
  maxPriorityFeePerGas: String,
  transactionFee: String, // In wei or equivalent
  transactionFeeUSD: Number, // In USD
  
  // Status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'confirmed', 'failed', 'dropped', 'replaced'],
    default: 'pending'
  },
  
  blockNumber: {
    type: Number,
    index: true,
    required: [
      function() { return this.status === 'confirmed'; },
      'Block number is required for confirmed transactions'
    ]
  },
  
  blockHash: String,
  blockTimestamp: Date,
  
  confirmations: {
    type: Number,
    default: 0
  },
  
  // Related Entities
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },
  
  refund: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Refund'
  },
  
  crop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Crop'
  },
  
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Error Information
  error: {
    code: String,
    message: String,
    data: mongoose.Schema.Types.Mixed
  },
  
  // Transaction Data
  data: String,
  nonce: Number,
  
  // Metadata
  description: String,
  metadata: mongoose.Schema.Types.Mixed,
  
  // Timestamps
  submittedAt: {
    type: Date,
    default: Date.now
  },
  
  confirmedAt: Date,
  
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
transactionSchema.index({ network: 1, hash: 1 }, { unique: true });
transactionSchema.index({ fromAddress: 1, status: 1 });
transactionSchema.index({ toAddress: 1, status: 1 });
transactionSchema.index({ tokenAddress: 1, status: 1 });
transactionSchema.index({ 'metadata.tags': 1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ status: 1, submittedAt: -1 });

// Virtual for transaction URL
transactionSchema.virtual('explorerUrl').get(function() {
  if (!this.hash) return null;
  
  const baseUrls = {
    ethereum: 'https://etherscan.io/tx/',
    polygon: 'https://polygonscan.com/tx/',
    binance: 'https://bscscan.com/tx/',
    solana: 'https://explorer.solana.com/tx/'
  };
  
  const baseUrl = baseUrls[this.network] || '';
  return baseUrl + this.hash;
});

// Virtual for token explorer URL
transactionSchema.virtual('tokenExplorerUrl').get(function() {
  if (!this.tokenAddress) return null;
  
  const baseUrls = {
    ethereum: 'https://etherscan.io/token/',
    polygon: 'https://polygonscan.com/token/',
    binance: 'https://bscscan.com/token/',
    solana: 'https://explorer.solana.com/address/'
  };
  
  const baseUrl = baseUrls[this.network] || '';
  return baseUrl + this.tokenAddress;
});

// Pre-save hook to update timestamps
transactionSchema.pre('save', function(next) {
  const now = new Date();
  this.updatedAt = now;
  
  // Update confirmedAt when status changes to confirmed
  if (this.isModified('status') && this.status === 'confirmed' && !this.confirmedAt) {
    this.confirmedAt = now;
  }
  
  // Generate display amount if not set
  if (this.amount && !this.displayAmount && this.tokenDecimals) {
    this.displayAmount = parseFloat(this.amount) / Math.pow(10, this.tokenDecimals);
  }
  
  next();
});

// Method to get transaction status
// transactionSchema.methods.getStatus = function() {
//   return {
//     status: this.status,
//     confirmations: this.confirmations,
//     confirmed: this.status === 'confirmed',
//     pending: this.status === 'pending',
//     failed: this.status === 'failed',
//     dropped: this.status === 'dropped',
//     replaced: this.status === 'replaced'
//   };
// };

// Static method to get transactions by address
transactionSchema.statics.findByAddress = function(address, options = {}) {
  const query = {
    $or: [
      { fromAddress: address },
      { toAddress: address }
    ]
  };
  
  if (options.network) {
    query.network = options.network;
  }
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.tokenAddress) {
    query.tokenAddress = options.tokenAddress;
  }
  
  return this.find(query)
    .sort({ blockNumber: -1, submittedAt: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0);
};

// Static method to get pending transactions
transactionSchema.statics.getPendingTransactions = function(network, options = {}) {
  const query = {
    status: 'pending',
    network: network || 'polygon'
  };
  
  if (options.address) {
    query.$or = [
      { fromAddress: options.address },
      { toAddress: options.address }
    ];
  }
  
  return this.find(query)
    .sort({ submittedAt: 1 })
    .limit(options.limit || 100);
};

// Static method to get transactions for a block
transactionSchema.statics.getBlockTransactions = function(blockNumber, network, options = {}) {
  return this.find({
    blockNumber: blockNumber,
    network: network || 'polygon',
    status: 'confirmed'
  })
  .sort({ transactionIndex: 1 })
  .limit(options.limit || 1000);
};

// Static method to get transaction volume by period
transactionSchema.statics.getVolumeByPeriod = async function({
  network,
  period = 'day',
  startDate,
  endDate,
  tokenAddress
} = {}) {
  const match = {
    status: 'confirmed',
    type: { $in: ['token_transfer', 'payment', 'refund'] }
  };
  
  if (network) {
    match.network = network;
  }
  
  if (tokenAddress) {
    match.tokenAddress = tokenAddress;
  }
  
  if (startDate || endDate) {
    match.confirmedAt = {};
    if (startDate) match.confirmedAt.$gte = new Date(startDate);
    if (endDate) match.confirmedAt.$lte = new Date(endDate);
  }
  
  const group = {
    _id: {},
    count: { $sum: 1 },
    totalAmount: { $sum: { $toDecimal: '$amount' } },
    totalFee: { $sum: { $toDecimal: '$transactionFee' } }
  };
  
  // Group by period
  const dateFormat = {
    day: { $dateToString: { format: '%Y-%m-%d', date: '$confirmedAt' } },
    week: { $dateToString: { format: '%Y-%U', date: '$confirmedAt' } },
    month: { $dateToString: { format: '%Y-%m', date: '$confirmedAt' } },
    year: { $dateToString: { format: '%Y', date: '$confirmedAt' } }
  }[period] || '%Y-%m-%d';
  
  group._id.period = dateFormat;
  
  // Optional grouping
  if (tokenAddress) {
    group._id.tokenAddress = '$tokenAddress';
    group._id.tokenSymbol = '$tokenSymbol';
  } else {
    group._id.network = '$network';
  }
  
  const result = await this.aggregate([
    { $match: match },
    { $group: group },
    { $sort: { '_id.period': 1 } }
  ]);
  
  return result;
};

module.exports = mongoose.model('Transaction', transactionSchema);
