const Stripe = require('stripe');
const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');
const Payment = require('../models/Payment');
const User = require('../models/User');

class PaymentService { // Handles payment-related operations, including fiat and crypto
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_KEY_SECRET, {
      apiVersion: '2023-10-16'
    });

    this.baseUrl = 'https://api.stripe.com/v1';
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  }

  /**
   * Create a Stripe order for fiat payment
   */
  async createFiatOrder(amount, currency = 'INR', notes = {}) {
    try {
      const options = {
        amount: Math.round(amount * 100), // Stripe expects amount in cents
        currency,
        receipt: `rcpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        notes
      };

      const order = await this.stripe.paymentIntents.create(options);

      logger.info(`Stripe order created: ${order.id} for amount ${amount} ${currency}`);

      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        receipt: order.receipt,
        notes: order.notes
      };

    } catch (error) {
      logger.error('Error creating Stripe order:', error);
      throw new Error('Failed to create payment order');
    }
  }

  /**
   * Verify Stripe payment signature
   */
  verifyPaymentSignature(orderId, paymentId, signature) {
    try {
      const sign = orderId + '|' + paymentId;
      const expectedSign = crypto
        .createHmac('sha256', process.env.STRIPE_KEY_SECRET)
        .update(sign.toString())
        .digest('hex');

      return expectedSign === signature;
    } catch (error) {
      logger.error('Error verifying payment signature:', error);
      return false;
    }
  }

  /**
   * Process fiat payment completion
   */
  async processFiatPayment(paymentData) {
    try {
      const {
        orderId,
        paymentId,
        signature,
        amount,
        currency,
        payerId,
        payeeId,
        cropId,
        orderDetails
      } = paymentData;

      // Verify payment signature
      const isValidSignature = this.verifyPaymentSignature(orderId, paymentId, signature);
      if (!isValidSignature) {
        throw new Error('Invalid payment signature');
      }

      // Fetch payment details from Stripe
      const stripePayment = await this.stripe.paymentIntents.retrieve(paymentId);

      if (stripePayment.status !== 'succeeded') {
        throw new Error('Payment not captured');
      }

      // Create payment record
      const payment = await Payment.create({
        orderId,
        amount: amount / 100, // Convert from cents to rupees
        currency,
        paymentMethod: 'upi',
        paymentGateway: 'stripe',
        status: 'completed',
        payer: payerId,
        payee: payeeId,
        crop: cropId,
        order: orderDetails,
        fiatDetails: {
          gatewayPaymentId: paymentId,
          gatewayOrderId: orderId,
          method: stripePayment.payment_method_types[0],
          bank: stripePayment.payment_method_details.card.brand,
          wallet: stripePayment.payment_method_details.card.wallet,
          vpa: stripePayment.payment_method_details.card.vpa,
          fee: stripePayment.application_fee_amount / 100,
          tax: stripePayment.tax_amounts[0].amount / 100,
          receipt: stripePayment.receipt_email
        },
        paidAt: new Date()
      });

      logger.info(`Fiat payment processed successfully: ${payment.paymentId}`);

      return payment;

    } catch (error) {
      logger.error('Error processing fiat payment:', error);
      throw error;
    }
  }

  /**
   * Get current INR to MATIC exchange rate
   */
  async getExchangeRate() {
    try {
      // Get MATIC price in INR from CoinGecko
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=inr'
      );

      const maticToInr = response.data['matic-network'].inr;
      const inrToMatic = 1 / maticToInr;

      return {
        inrToMatic,
        maticToInr,
        timestamp: new Date(),
        source: 'coingecko'
      };

    } catch (error) {
      logger.error('Error fetching exchange rate:', error);

      // Fallback rate (approximate)
      return {
        inrToMatic: 0.00025, // 1 INR ≈ 0.00025 MATIC
        maticToInr: 4000,    // 1 MATIC ≈ 4000 INR
        timestamp: new Date(),
        source: 'fallback'
      };
    }
  }

  /**
   * Convert fiat amount to crypto amount
   */
  async convertFiatToCrypto(fiatAmount, fiatCurrency = 'INR', cryptoCurrency = 'MATIC') {
    try {
      const exchangeRate = await this.getExchangeRate();

      if (cryptoCurrency === 'MATIC' && fiatCurrency === 'INR') {
        const cryptoAmount = fiatAmount * exchangeRate.inrToMatic;
        return {
          fiatAmount,
          fiatCurrency,
          cryptoAmount,
          cryptoCurrency,
          exchangeRate: exchangeRate.inrToMatic,
          timestamp: exchangeRate.timestamp,
          source: exchangeRate.source
        };
      }

      throw new Error(`Unsupported currency conversion: ${fiatCurrency} to ${cryptoCurrency}`);

    } catch (error) {
      logger.error('Error converting fiat to crypto:', error);
      throw error;
    }
  }

  /**
   * Create a hybrid payment (fiat + crypto option)
   */
  async createHybridPayment(paymentData) {
    try {
      const {
        fiatAmount,
        fiatCurrency = 'INR',
        payerId,
        payeeId,
        cropId,
        orderDetails,
        paymentType = 'fiat' // 'fiat' or 'crypto'
      } = paymentData;

      if (paymentType === 'fiat') {
        // Create Stripe order
        const order = await this.createFiatOrder(fiatAmount, fiatCurrency, {
          payerId: payerId.toString(),
          payeeId: payeeId.toString(),
          cropId: cropId.toString(),
          type: 'crop_purchase'
        });

        // Create payment record with pending status
        const payment = await Payment.create({
          orderId: order.orderId,
          amount: fiatAmount,
          currency: fiatCurrency,
          paymentMethod: 'upi',
          paymentGateway: 'stripe',
          status: 'pending',
          payer: payerId,
          payee: payeeId,
          crop: cropId,
          order: orderDetails,
          fiatDetails: {
            gatewayOrderId: order.orderId
          }
        });

        return {
          payment,
          stripeOrder: order,
          paymentType: 'fiat'
        };

      } else if (paymentType === 'crypto') {
        // Convert fiat to crypto
        const conversion = await this.convertFiatToCrypto(fiatAmount, fiatCurrency);

        // Create payment record for crypto payment
        const payment = await Payment.create({
          amount: fiatAmount,
          currency: fiatCurrency,
          paymentMethod: 'crypto',
          status: 'pending',
          payer: payerId,
          payee: payeeId,
          crop: cropId,
          order: orderDetails,
          cryptoDetails: {
            cryptoAmount: conversion.cryptoAmount,
            cryptoCurrency: conversion.cryptoCurrency,
            network: 'polygon'
          }
        });

        return {
          payment,
          conversion,
          paymentType: 'crypto',
          instructions: {
            network: 'Polygon',
            token: 'MATIC',
            amount: conversion.cryptoAmount,
            recipientAddress: '0xRecipientAddress', // Get from payee's wallet
            estimatedGas: '0.0001 MATIC'
          }
        };

      }

      throw new Error('Invalid payment type');

    } catch (error) {
      logger.error('Error creating hybrid payment:', error);
      throw error;
    }
  }

  /**
   * Process crypto payment confirmation
   */
  async processCryptoPayment(paymentData) {
    try {
      const {
        paymentId,
        transactionHash,
        fromAddress,
        toAddress,
        cryptoAmount,
        blockNumber
      } = paymentData;

      // Update payment record
      const payment = await Payment.findByIdAndUpdate(
        paymentId,
        {
          status: 'completed',
          'cryptoDetails.transactionHash': transactionHash,
          'cryptoDetails.fromAddress': fromAddress,
          'cryptoDetails.toAddress': toAddress,
          'cryptoDetails.cryptoAmount': cryptoAmount,
          'cryptoDetails.blockNumber': blockNumber,
          'cryptoDetails.confirmations': 1,
          paidAt: new Date()
        },
        { new: true }
      );

      if (!payment) {
        throw new Error('Payment not found');
      }

      logger.info(`Crypto payment processed successfully: ${payment.paymentId}`);

      return payment;

    } catch (error) {
      logger.error('Error processing crypto payment:', error);
      throw error;
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId) {
    try {
      const payment = await Payment.findById(paymentId)
        .populate('payer', 'name email')
        .populate('payee', 'name email')
        .populate('crop', 'name cropId');

      if (!payment) {
        throw new Error('Payment not found');
      }

      return payment;

    } catch (error) {
      logger.error('Error getting payment status:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook
   */
  async handleWebhook(webhookBody, signature) {
    try {
      // Verify webhook signature
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(JSON.stringify(webhookBody))
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new Error('Invalid webhook signature');
      }

      const { event, payload } = webhookBody;

      logger.info(`Stripe webhook received: ${event}`);

      switch (event) {
        case 'payment_intent.succeeded':
          await this.handlePaymentCaptured(payload.payment_intent);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(payload.payment_intent);
          break;

        case 'checkout.session.completed':
          await this.handleOrderPaid(payload.session);
          break;

        default:
          logger.info(`Unhandled webhook event: ${event}`);
      }

      return { success: true, event };

    } catch (error) {
      logger.error('Error handling webhook:', error);
      throw error;
    }
  }

  /**
   * Handle payment captured webhook
   */
  async handlePaymentCaptured(paymentIntent) {
    try {
      // Find payment by gateway payment ID
      const payment = await Payment.findOne({
        'fiatDetails.gatewayPaymentId': paymentIntent.id
      });

      if (payment && payment.status !== 'completed') {
        payment.status = 'completed';
        payment.paidAt = new Date();
        payment.fiatDetails = {
          ...payment.fiatDetails,
          ...paymentIntent
        };
        await payment.save();

        logger.info(`Payment marked as completed: ${payment.paymentId}`);
      }

    } catch (error) {
      logger.error('Error handling payment captured:', error);
      throw error;
    }
  }

  /**
   * Handle payment failed webhook
   */
  async handlePaymentFailed(paymentIntent) {
    try {
      const payment = await Payment.findOne({
        'fiatDetails.gatewayPaymentId': paymentIntent.id
      });

      if (payment) {
        payment.status = 'failed';
        await payment.save();

        logger.info(`Payment marked as failed: ${payment.paymentId}`);
      }

    } catch (error) {
      logger.error('Error handling payment failed:', error);
      throw error;
    }
  }

  /**
   * Handle order paid webhook
   */
  async handleOrderPaid(session) {
    try {
      const payment = await Payment.findOne({
        orderId: session.payment_intent
      });

      if (payment && payment.status !== 'completed') {
        payment.status = 'completed';
        payment.paidAt = new Date();
        await payment.save();

        logger.info(`Order marked as paid: ${payment.paymentId}`);
      }

    } catch (error) {
      logger.error('Error handling order paid:', error);
      throw error;
    }
  }
}
module.exports = new PaymentService();