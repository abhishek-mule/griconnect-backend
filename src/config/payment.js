const Razorpay = require('razorpay');
const logger = require('../utils/logger');

// Initialize Razorpay client
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Payment methods configuration
const PAYMENT_METHODS = {
  UPI: {
    enabled: true,
    name: 'UPI',
    description: 'Unified Payments Interface',
    minAmount: 1, // 1 INR
    maxAmount: 100000, // 1,00,000 INR
    currencies: ['INR'],
    fees: {
      percentage: 1.5, // 1.5% of transaction amount
      minFee: 5, // Minimum 5 INR
      maxFee: 100 // Maximum 100 INR
    }
  },
  CRYPTO: {
    enabled: true,
    name: 'Crypto',
    description: 'Cryptocurrency Payment',
    minAmount: 0.001, // 0.001 MATIC
    maxAmount: 1000, // 1000 MATIC
    currencies: ['MATIC', 'POL'],
    network: 'Polygon',
    fees: {
      gasLimit: 21000, // Standard gas limit for MATIC transfer
      gasPrice: 30 // Gwei
    }
  }
};

// Get payment method configuration
const getPaymentMethod = (method) => {
  const paymentMethod = PAYMENT_METHODS[method.toUpperCase()];
  if (!paymentMethod) {
    throw new Error(`Payment method ${method} is not supported`);
  }
  if (!paymentMethod.enabled) {
    throw new Error(`Payment method ${method} is currently disabled`);
  }
  return paymentMethod;
};

// Validate payment amount
const validatePaymentAmount = (amount, method) => {
  const paymentMethod = getPaymentMethod(method);
  
  if (amount < paymentMethod.minAmount) {
    throw new Error(`Minimum amount for ${paymentMethod.name} is ${paymentMethod.minAmount} ${paymentMethod.currencies[0]}`);
  }
  
  if (amount > paymentMethod.maxAmount) {
    throw new Error(`Maximum amount for ${paymentMethod.name} is ${paymentMethod.maxAmount} ${paymentMethod.currencies[0]}`);
  }
  
  return true;
};

// Calculate payment fees
const calculateFees = (amount, method) => {
  const paymentMethod = getPaymentMethod(method);
  
  if (method.toUpperCase() === 'UPI') {
    const fee = Math.max(
      paymentMethod.fees.minFee,
      Math.min(
        paymentMethod.fees.maxFee,
        (amount * paymentMethod.fees.percentage) / 100
      )
    );
    return {
      amount: amount - fee,
      fee,
      feePercentage: paymentMethod.fees.percentage,
      total: amount
    };
  }
  
  // For crypto, fees are paid by the sender in gas
  return {
    amount,
    fee: 0,
    feePercentage: 0,
    total: amount
  };
};

module.exports = {
  razorpay,
  PAYMENT_METHODS,
  getPaymentMethod,
  validatePaymentAmount,
  calculateFees
};
