const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const paymentService = require('../services/paymentService');
const Payment = require('../models/Payment');
const Crop = require('../models/Crop');
const logger = require('../utils/logger');
const { success, error } = require('../utils/response');

const router = express.Router();

/**
 * @route   POST /api/payment/create-order
 * @desc    Create a payment order (fiat or crypto)
 * @access  Private
 */
router.post('/create-order', [
  authenticate,
  body('cropId')
    .isMongoId()
    .withMessage('Valid crop ID is required'),
  body('quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be greater than 0'),
  body('paymentType')
    .isIn(['fiat', 'crypto'])
    .withMessage('Payment type must be fiat or crypto')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { cropId, quantity, paymentType } = req.body;
    const userId = req.user._id;

    // Get crop details
    const crop = await Crop.findById(cropId);
    if (!crop) {
      return error(res, 'Crop not found', 404);
    }

    // Check if crop is available
    if (!crop.isAvailable(quantity)) {
      return error(res, 'Crop is not available for the requested quantity', 400);
    }

    // Calculate price
    const priceCalculation = crop.calculatePrice(quantity);

    // Create order details
    const orderDetails = {
      items: [{
        crop: crop._id,
        quantity,
        unitPrice: priceCalculation.unitPrice,
        subtotal: priceCalculation.subtotal,
        discount: priceCalculation.discount,
        total: priceCalculation.total,
        currency: priceCalculation.currency
      }],
      subtotal: priceCalculation.subtotal,
      discount: priceCalculation.discount,
      total: priceCalculation.total,
      currency: priceCalculation.currency,
      notes: `Purchase of ${quantity} ${crop.quantity.unit} ${crop.name}`
    };

    // Create hybrid payment
    const paymentResult = await paymentService.createHybridPayment({
      fiatAmount: priceCalculation.total,
      fiatCurrency: priceCalculation.currency,
      payerId: userId,
      payeeId: crop.farmer,
      cropId: crop._id,
      orderDetails,
      paymentType
    });

    logger.info(`Payment order created: ${paymentResult.payment.paymentId} for user ${req.user.email}`);

    success(res, 'Payment order created successfully', paymentResult);

  } catch (err) {
    logger.error('Create payment order error:', err);
    error(res, 'Failed to create payment order', 500);
  }
});

/**
 * @route   POST /api/payment/verify-fiat
 * @desc    Verify and process fiat payment
 * @access  Private
 */
router.post('/verify-fiat', [
  authenticate,
  body('orderId')
    .notEmpty()
    .withMessage('Order ID is required'),
  body('paymentId')
    .notEmpty()
    .withMessage('Payment ID is required'),
  body('signature')
    .notEmpty()
    .withMessage('Signature is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { orderId, paymentId, signature } = req.body;

    // Find the payment record
    const payment = await Payment.findOne({
      orderId,
      payer: req.user._id,
      status: 'pending'
    });

    if (!payment) {
      return error(res, 'Payment order not found', 404);
    }

    // Process fiat payment
    const processedPayment = await paymentService.processFiatPayment({
      orderId,
      paymentId,
      signature,
      amount: payment.amount,
      currency: payment.currency,
      payerId: payment.payer,
      payeeId: payment.payee,
      cropId: payment.crop,
      orderDetails: payment.order
    });

    // Update crop quantity
    await Crop.findByIdAndUpdate(payment.crop, {
      $inc: { 'quantity.available': -payment.order.items[0].quantity }
    });

    logger.info(`Fiat payment verified: ${processedPayment.paymentId}`);

    success(res, 'Payment verified and processed successfully', {
      payment: processedPayment
    });

  } catch (err) {
    logger.error('Verify fiat payment error:', err);
    error(res, err.message || 'Failed to verify payment', 500);
  }
});

/**
 * @route   POST /api/payment/confirm-crypto
 * @desc    Confirm crypto payment with transaction details
 * @access  Private
 */
router.post('/confirm-crypto', [
  authenticate,
  body('paymentId')
    .isMongoId()
    .withMessage('Valid payment ID is required'),
  body('transactionHash')
    .matches(/^0x[a-fA-F0-9]{64}$/)
    .withMessage('Valid transaction hash is required'),
  body('fromAddress')
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Valid from address is required'),
  body('toAddress')
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Valid to address is required'),
  body('cryptoAmount')
    .isFloat({ min: 0 })
    .withMessage('Crypto amount must be positive')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const {
      paymentId,
      transactionHash,
      fromAddress,
      toAddress,
      cryptoAmount,
      blockNumber
    } = req.body;

    // Verify payment ownership
    const payment = await Payment.findOne({
      _id: paymentId,
      payer: req.user._id,
      status: 'pending'
    });

    if (!payment) {
      return error(res, 'Payment not found or already processed', 404);
    }

    // Process crypto payment
    const processedPayment = await paymentService.processCryptoPayment({
      paymentId,
      transactionHash,
      fromAddress,
      toAddress,
      cryptoAmount,
      blockNumber
    });

    // Update crop quantity
    await Crop.findByIdAndUpdate(payment.crop, {
      $inc: { 'quantity.available': -payment.order.items[0].quantity }
    });

    logger.info(`Crypto payment confirmed: ${processedPayment.paymentId}`);

    success(res, 'Crypto payment confirmed successfully', {
      payment: processedPayment
    });

  } catch (err) {
    logger.error('Confirm crypto payment error:', err);
    error(res, err.message || 'Failed to confirm crypto payment', 500);
  }
});

/**
 * @route   GET /api/payment/exchange-rate
 * @desc    Get current INR to MATIC exchange rate
 * @access  Public
 */
router.get('/exchange-rate', async (req, res) => {
  try {
    const exchangeRate = await paymentService.getExchangeRate();

    success(res, 'Exchange rate retrieved successfully', {
      exchangeRate
    });

  } catch (err) {
    logger.error('Get exchange rate error:', err);
    error(res, 'Failed to get exchange rate', 500);
  }
});

/**
 * @route   GET /api/payment/:id
 * @desc    Get payment details
 * @access  Private
 */
router.get('/:id', [
  authenticate,
  param('id')
    .isMongoId()
    .withMessage('Valid payment ID is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const payment = await paymentService.getPaymentStatus(req.params.id);

    // Check if user is payer or payee
    if (payment.payer._id.toString() !== req.user._id.toString() &&
        payment.payee._id.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      return error(res, 'Not authorized to view this payment', 403);
    }

    success(res, 'Payment details retrieved successfully', {
      payment
    });

  } catch (err) {
    logger.error('Get payment error:', err);
    error(res, err.message || 'Failed to get payment details', 500);
  }
});

/**
 * @route   GET /api/payment/user/:userId
 * @desc    Get user's payment history
 * @access  Private
 */
router.get('/user/:userId', [
  authenticate,
  param('userId')
    .isMongoId()
    .withMessage('Valid user ID is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { userId } = req.params;
    const { page = 1, limit = 10, status, paymentMethod } = req.query;

    // Check if user is requesting their own payments or is admin
    if (userId !== req.user._id.toString() && req.user.role !== 'admin') {
      return error(res, 'Not authorized to view these payments', 403);
    }

    // Build query
    const query = {
      $or: [
        { payer: userId },
        { payee: userId }
      ]
    };

    if (status) {
      query.status = status;
    }

    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    // Get payments with pagination
    const payments = await Payment.find(query)
      .populate('payer', 'name email')
      .populate('payee', 'name email')
      .populate('crop', 'name cropId')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payment.countDocuments(query);

    success(res, 'Payment history retrieved successfully', {
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    logger.error('Get user payments error:', err);
    error(res, 'Failed to get payment history', 500);
  }
});

/**
 * @route   POST /api/payment/webhook/razorpay
 * @desc    Handle Razorpay webhook
 * @access  Public (but secured with signature)
 */
router.post('/webhook/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const webhookBody = JSON.parse(req.body);

    await paymentService.handleWebhook(webhookBody, signature);

    res.status(200).json({ success: true });

  } catch (err) {
    logger.error('Webhook error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * @route   GET /api/payment/summary/:userId
 * @desc    Get payment summary for user
 * @access  Private
 */
router.get('/summary/:userId', [
  authenticate,
  param('userId')
    .isMongoId()
    .withMessage('Valid user ID is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { userId } = req.params;
    const { timeframe = 'month' } = req.query;

    // Check if user is requesting their own summary or is admin
    if (userId !== req.user._id.toString() && req.user.role !== 'admin') {
      return error(res, 'Not authorized to view this summary', 403);
    }

    const summary = await Payment.getSummary(userId, timeframe);

    success(res, 'Payment summary retrieved successfully', {
      summary,
      timeframe
    });

  } catch (err) {
    logger.error('Get payment summary error:', err);
    error(res, 'Failed to get payment summary', 500);
  }
});

module.exports = router;