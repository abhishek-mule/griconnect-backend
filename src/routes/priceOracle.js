const express = require('express');
const { query, validationResult } = require('express-validator');
const priceOracleService = require('../services/priceOracleService');
const logger = require('../utils/logger');
const { success, error } = require('../utils/response');

const router = express.Router();

/**
 * @route   GET /api/price-oracle/price
 * @desc    Get aggregated price for a cryptocurrency
 * @access  Public
 */
router.get('/price', [
  query('crypto')
    .optional()
    .isIn(['matic-network', 'ethereum', 'bitcoin', 'usd-coin', 'tether'])
    .withMessage('Invalid cryptocurrency'),
  query('currency')
    .optional()
    .isIn(['inr', 'usd', 'eur'])
    .withMessage('Invalid currency')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { crypto = 'matic-network', currency = 'inr' } = req.query;

    const priceData = await priceOracleService.getAggregatedPrice(crypto, currency);

    success(res, 'Price data retrieved successfully', {
      priceData
    });

  } catch (err) {
    logger.error('Get price error:', err);
    error(res, 'Failed to get price data', 500);
  }
});

/**
 * @route   GET /api/price-oracle/exchange-rate
 * @desc    Get exchange rate between two currencies
 * @access  Public
 */
router.get('/exchange-rate', [
  query('from')
    .isIn(['INR', 'USD', 'EUR', 'MATIC', 'ETH', 'matic-network', 'ethereum', 'bitcoin', 'usd-coin', 'tether'])
    .withMessage('Invalid from currency'),
  query('to')
    .isIn(['INR', 'USD', 'EUR', 'MATIC', 'ETH', 'matic-network', 'ethereum', 'bitcoin', 'usd-coin', 'tether'])
    .withMessage('Invalid to currency')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { from, to } = req.query;

    const exchangeRate = await priceOracleService.getExchangeRate(from, to);

    success(res, 'Exchange rate retrieved successfully', {
      exchangeRate
    });

  } catch (err) {
    logger.error('Get exchange rate error:', err);
    error(res, err.message || 'Failed to get exchange rate', 500);
  }
});

/**
 * @route   GET /api/price-oracle/volatility
 * @desc    Get price volatility for a cryptocurrency
 * @access  Public
 */
router.get('/volatility', [
  query('crypto')
    .optional()
    .isIn(['matic-network', 'ethereum', 'bitcoin', 'usd-coin', 'tether'])
    .withMessage('Invalid cryptocurrency'),
  query('currency')
    .optional()
    .isIn(['inr', 'usd', 'eur'])
    .withMessage('Invalid currency'),
  query('hours')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('Hours must be between 1 and 168')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { crypto = 'matic-network', currency = 'inr', hours = 24 } = req.query;

    const volatility = await priceOracleService.getPriceVolatility(crypto, currency, parseInt(hours));

    success(res, 'Volatility data retrieved successfully', {
      volatility
    });

  } catch (err) {
    logger.error('Get volatility error:', err);
    error(res, 'Failed to get volatility data', 500);
  }
});

/**
 * @route   GET /api/price-oracle/alerts
 * @desc    Get price alerts and recommendations
 * @access  Public
 */
router.get('/alerts', [
  query('crypto')
    .optional()
    .isIn(['matic-network', 'ethereum', 'bitcoin', 'usd-coin', 'tether'])
    .withMessage('Invalid cryptocurrency'),
  query('currency')
    .optional()
    .isIn(['inr', 'usd', 'eur'])
    .withMessage('Invalid currency')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { crypto = 'matic-network', currency = 'inr' } = req.query;

    const alerts = await priceOracleService.getPriceAlerts(crypto, currency);

    success(res, 'Price alerts retrieved successfully', {
      alerts
    });

  } catch (err) {
    logger.error('Get alerts error:', err);
    error(res, 'Failed to get price alerts', 500);
  }
});

/**
 * @route   GET /api/price-oracle/sources
 * @desc    Get available price sources and their status
 * @access  Public
 */
router.get('/sources', async (req, res) => {
  try {
    const sources = [
      {
        name: 'CoinGecko',
        id: 'coingecko',
        status: 'active',
        supportedCryptos: ['matic-network', 'ethereum', 'bitcoin', 'usd-coin', 'tether'],
        supportedCurrencies: ['inr', 'usd', 'eur'],
        apiKeyRequired: false,
        rateLimit: '50 requests/minute (free), 500 requests/minute (with API key)'
      },
      {
        name: 'CoinMarketCap',
        id: 'coinmarketcap',
        status: process.env.COINMARKETCAP_API_KEY ? 'active' : 'inactive',
        supportedCryptos: ['MATIC', 'ETH', 'BTC', 'USDC', 'USDT'],
        supportedCurrencies: ['INR', 'USD', 'EUR'],
        apiKeyRequired: true,
        rateLimit: '10,000 requests/month (free), higher limits for paid plans'
      },
      {
        name: 'Chainlink',
        id: 'chainlink',
        status: 'active',
        supportedCryptos: ['MATIC'],
        supportedCurrencies: ['INR', 'USD'],
        apiKeyRequired: false,
        rateLimit: 'Unlimited (on-chain)',
        notes: 'Provides decentralized price feeds on Polygon network'
      }
    ];

    success(res, 'Price sources retrieved successfully', {
      sources,
      totalSources: sources.length,
      activeSources: sources.filter(s => s.status === 'active').length
    });

  } catch (err) {
    logger.error('Get sources error:', err);
    error(res, 'Failed to get price sources', 500);
  }
});

/**
 * @route   POST /api/price-oracle/clear-cache
 * @desc    Clear price cache (admin only)
 * @access  Private (Admin)
 */
router.post('/clear-cache', async (req, res) => {
  try {
    // TODO: Add admin authentication middleware
    // For now, allowing public access for testing

    priceOracleService.clearCache();

    success(res, 'Price cache cleared successfully');

  } catch (err) {
    logger.error('Clear cache error:', err);
    error(res, 'Failed to clear price cache', 500);
  }
});

/**
 * @route   GET /api/price-oracle/health
 * @desc    Check price oracle service health
 * @access  Public
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      service: 'price-oracle',
      status: 'healthy',
      timestamp: new Date(),
      cache: {
        size: priceOracleService.priceCache.size,
        expiryMs: priceOracleService.cacheExpiry
      },
      sources: {
        coingecko: !!process.env.COINGECKO_API_KEY,
        coinmarketcap: !!process.env.COINMARKETCAP_API_KEY,
        chainlink: !!process.env.CHAINLINK_PRICE_FEED
      }
    };

    // Test a quick price fetch
    try {
      const testPrice = await priceOracleService.getAggregatedPrice('matic-network', 'inr');
      health.lastPriceCheck = {
        success: true,
        price: testPrice.aggregatedPrice,
        confidence: testPrice.confidence,
        sources: testPrice.sources.length
      };
    } catch (testError) {
      health.lastPriceCheck = {
        success: false,
        error: testError.message
      };
      health.status = 'degraded';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (err) {
    logger.error('Health check error:', err);
    res.status(503).json({
      service: 'price-oracle',
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date()
    });
  }
});

/**
 * @route   GET /api/price-oracle/compare
 * @desc    Compare prices across all sources
 * @access  Public
 */
router.get('/compare', [
  query('crypto')
    .optional()
    .isIn(['matic-network', 'ethereum', 'bitcoin', 'usd-coin', 'tether'])
    .withMessage('Invalid cryptocurrency'),
  query('currency')
    .optional()
    .isIn(['inr', 'usd', 'eur'])
    .withMessage('Invalid currency')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { crypto = 'matic-network', currency = 'inr' } = req.query;

    const priceData = await priceOracleService.getAggregatedPrice(crypto, currency);

    // Return detailed comparison
    const comparison = {
      crypto: crypto,
      currency: currency.toUpperCase(),
      aggregated: {
        price: priceData.aggregatedPrice,
        confidence: priceData.confidence,
        sources: priceData.sources
      },
      individual: priceData.individualPrices,
      statistics: {
        priceRange: priceData.priceRange,
        variance: priceData.metadata.variance,
        standardDeviation: priceData.metadata.standardDeviation,
        coefficientOfVariation: priceData.metadata.coefficientOfVariation
      },
      timestamp: priceData.timestamp
    };

    success(res, 'Price comparison retrieved successfully', {
      comparison
    });

  } catch (err) {
    logger.error('Price comparison error:', err);
    error(res, 'Failed to get price comparison', 500);
  }
});

module.exports = router;