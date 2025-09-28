const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const blockchainService = require('../services/blockchainService');
const Crop = require('../models/Crop');
const User = require('../models/User');
const logger = require('../utils/logger');
const { success, error } = require('../utils/response');

const router = express.Router();

/**
 * @route   POST /api/blockchain/mint-nft
 * @desc    Enable NFT-based traceability for crops
 * @access  Private (Farmers)
 */
router.post('/mint-nft', [
  authenticate,
  authorize('farmer'),
  body('cropId')
    .isMongoId()
    .withMessage('Valid crop ID is required'),
  body('recipientAddress')
    .optional()
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Valid Ethereum address required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { cropId, recipientAddress } = req.body;

    // Get crop details
    const crop = await Crop.findById(cropId).populate('farmer');

    if (!crop) {
      return error(res, 'Crop not found', 404);
    }

    // Check if user owns the crop
    if (crop.farmer._id.toString() !== req.user._id.toString()) {
      return error(res, 'Not authorized to mint NFT for this crop', 403);
    }

    // Check if NFT already minted
    if (crop.nft?.isMinted) {
      return error(res, 'NFT already minted for this crop', 400);
    }

    // Use recipient address or farmer's wallet
    const recipient = recipientAddress || crop.farmer.walletAddress;

    if (!recipient) {
      return error(res, 'Recipient wallet address not found', 400);
    }

    // Mint NFT and enable traceability
    const nftResult = await blockchainService.mintCropNFT(crop, recipient);
    // Additional logic for traceability can be added here

    // Update crop with NFT data
    await Crop.findByIdAndUpdate(cropId, {
      'nft.tokenId': nftResult.tokenId,
      'nft.contractAddress': nftResult.contractAddress,
      'nft.tokenURI': nftResult.tokenURI,
      'nft.metadata': nftResult.metadata,
      'nft.isMinted': true,
      'nft.mintedAt': nftResult.mintedAt,
      'nft.transactionHash': nftResult.transactionHash
    });

    logger.info(`NFT minted for crop ${cropId}: Token ID ${nftResult.tokenId}`);

    success(res, 'NFT minted successfully', {
      nft: nftResult,
      cropId
    });

  } catch (err) {
    logger.error('Mint NFT error:', err);
    error(res, err.message || 'Failed to mint NFT', 500);
  }
});

/**
 * @route   GET /api/blockchain/nft/:tokenId
 * @desc    Get NFT details
 * @access  Public
 */
router.get('/nft/:tokenId', [
  param('tokenId')
    .matches(/^0x[a-fA-F0-9]+$/)
    .withMessage('Valid token ID required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { tokenId } = req.params;

    // Get NFT details
    const nftDetails = await blockchainService.getNFTDetails(tokenId);

    success(res, 'NFT details retrieved successfully', {
      nft: nftDetails
    });

  } catch (err) {
    logger.error('Get NFT details error:', err);
    error(res, err.message || 'Failed to get NFT details', 500);
  }
});

/**
 * @route   POST /api/blockchain/transfer-nft
 * @desc    Transfer NFT ownership
 * @access  Private
 */
router.post('/transfer-nft', [
  authenticate,
  body('tokenId')
    .matches(/^0x[a-fA-F0-9]+$/)
    .withMessage('Valid token ID required'),
  body('toAddress')
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Valid recipient address required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { tokenId, toAddress } = req.body;

    // Find crop by NFT token ID
    const crop = await Crop.findOne({ 'nft.tokenId': tokenId });

    if (!crop) {
      return error(res, 'NFT not found', 404);
    }

    // Check if user owns the NFT (is the farmer)
    if (crop.farmer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return error(res, 'Not authorized to transfer this NFT', 403);
    }

    // Transfer NFT
    const transferResult = await blockchainService.transferNFT(
      req.user.walletAddress || crop.farmer.walletAddress,
      toAddress,
      tokenId
    );

    logger.info(`NFT transferred: ${tokenId} to ${toAddress}`);

    success(res, 'NFT transferred successfully', {
      transfer: transferResult
    });

  } catch (err) {
    logger.error('Transfer NFT error:', err);
    error(res, err.message || 'Failed to transfer NFT', 500);
  }
});

/**
 * @route   POST /api/blockchain/create-payment
 * @desc    Create blockchain payment
 * @access  Private
 */
router.post('/create-payment', [
  authenticate,
  body('payeeAddress')
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Valid payee address required'),
  body('amount')
    .isFloat({ min: 0.000001 })
    .withMessage('Amount must be greater than 0'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { payeeAddress, amount, description = '' } = req.body;

    // Get user's wallet address
    const user = await User.findById(req.user._id);
    if (!user.walletAddress) {
      return error(res, 'User wallet address not configured', 400);
    }

    // Create blockchain payment
    const paymentResult = await blockchainService.createBlockchainPayment(
      user.walletAddress,
      payeeAddress,
      amount,
      description
    );

    logger.info(`Blockchain payment created: ${paymentResult.paymentId} for ${amount} MATIC`);

    success(res, 'Blockchain payment created successfully', {
      payment: paymentResult
    });

  } catch (err) {
    logger.error('Create blockchain payment error:', err);
    error(res, err.message || 'Failed to create blockchain payment', 500);
  }
});

/**
 * @route   POST /api/blockchain/release-payment
 * @desc    Release blockchain payment (admin/arbiter function)
 * @access  Private (Admin)
 */
router.post('/release-payment', [
  authenticate,
  authorize('admin'),
  body('paymentId')
    .isInt({ min: 1 })
    .withMessage('Valid payment ID required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { paymentId } = req.body;

    // Release payment
    const releaseResult = await blockchainService.releaseBlockchainPayment(paymentId);

    logger.info(`Blockchain payment released: ${paymentId}`);

    success(res, 'Payment released successfully', {
      release: releaseResult
    });

  } catch (err) {
    logger.error('Release payment error:', err);
    error(res, err.message || 'Failed to release payment', 500);
  }
});

/**
 * @route   GET /api/blockchain/wallet-balance/:address
 * @desc    Get wallet balance
 * @access  Public
 */
router.get('/wallet-balance/:address', [
  param('address')
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Valid wallet address required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { address } = req.params;

    // Get wallet balance
    const balance = await blockchainService.getWalletBalance(address);

    success(res, 'Wallet balance retrieved successfully', {
      balance
    });

  } catch (err) {
    logger.error('Get wallet balance error:', err);
    error(res, err.message || 'Failed to get wallet balance', 500);
  }
});

/**
 * @route   GET /api/blockchain/transaction/:txHash
 * @desc    Get transaction details
 * @access  Public
 */
router.get('/transaction/:txHash', [
  param('txHash')
    .matches(/^0x[a-fA-F0-9]{64}$/)
    .withMessage('Valid transaction hash required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { txHash } = req.params;

    // Get transaction details
    const transaction = await blockchainService.getTransactionDetails(txHash);

    success(res, 'Transaction details retrieved successfully', {
      transaction
    });

  } catch (err) {
    logger.error('Get transaction details error:', err);
    error(res, err.message || 'Failed to get transaction details', 500);
  }
});

/**
 * @route   GET /api/blockchain/network-info
 * @desc    Get blockchain network information
 * @access  Public
 */
router.get('/network-info', async (req, res) => {
  try {
    const networkInfo = await blockchainService.getNetworkInfo();

    success(res, 'Network information retrieved successfully', {
      network: networkInfo
    });

  } catch (err) {
    logger.error('Get network info error:', err);
    error(res, err.message || 'Failed to get network information', 500);
  }
});

/**
 * @route   GET /api/blockchain/estimate-gas
 * @desc    Estimate gas cost for transaction
 * @access  Public
 */
router.get('/estimate-gas', [
  query('to')
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Valid recipient address required'),
  query('value')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Value must be non-negative'),
  query('data')
    .optional()
    .matches(/^0x[a-fA-F0-9]*$/)
    .withMessage('Valid data hex required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { to, value = 0, data = '0x' } = req.query;

    const txData = {
      to,
      value: ethers.parseEther(value.toString()),
      data
    };

    const gasEstimate = await blockchainService.estimateGasCost(txData);

    success(res, 'Gas estimation completed successfully', {
      gasEstimate
    });

  } catch (err) {
    logger.error('Estimate gas error:', err);
    error(res, err.message || 'Failed to estimate gas cost', 500);
  }
});

/**
 * @route   GET /api/blockchain/validate-address/:address
 * @desc    Validate wallet address
 * @access  Public
 */
router.get('/validate-address/:address', [
  param('address')
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Valid Ethereum address required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { address } = req.params;

    const isValid = blockchainService.isValidAddress(address);

    success(res, 'Address validation completed', {
      address,
      isValid,
      network: blockchainService.currentNetwork
    });

  } catch (err) {
    logger.error('Validate address error:', err);
    error(res, 'Failed to validate address', 500);
  }
});

/**
 * @route   GET /api/blockchain/contract-status
 * @desc    Check smart contract deployment status
 * @access  Public
 */
router.get('/contract-status', async (req, res) => {
  try {
    const status = await blockchainService.checkContractStatus();

    success(res, 'Contract status retrieved successfully', {
      status
    });

  } catch (err) {
    logger.error('Get contract status error:', err);
    error(res, err.message || 'Failed to get contract status', 500);
  }
});

/**
 * @route   GET /api/blockchain/health
 * @desc    Check blockchain service health
 * @access  Public
 */
router.get('/health', async (req, res) => {
  try {
    const health = await blockchainService.healthCheck();

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (err) {
    logger.error('Blockchain health check error:', err);
    res.status(503).json({
      service: 'blockchain-service',
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date()
    });
  }
});

module.exports = router;