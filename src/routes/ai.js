const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const aiService = require('../services/aiService');
const Crop = require('../models/Crop');
const logger = require('../utils/logger');
const { success, error } = require('../utils/response');

const router = express.Router();

/**
 * @route   POST /api/ai/generate-story
 * @desc    Generate AI-powered crop story
 * @access  Private
 */
router.post('/generate-story', [
  authenticate,
  body('cropId')
    .isMongoId()
    .withMessage('Valid crop ID is required'),
  body('language')
    .optional()
    .isIn(['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or'])
    .withMessage('Unsupported language'),
  body('storyType')
    .optional()
    .isIn(['comprehensive', 'brief', 'technical'])
    .withMessage('Invalid story type')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { cropId, language = 'en', storyType = 'comprehensive' } = req.body;

    // Get crop details
    const crop = await Crop.findById(cropId)
      .populate('farmer', 'name')
      .populate('location');

    if (!crop) {
      return error(res, 'Crop not found', 404);
    }

    // Check if user has permission to generate story for this crop
    if (crop.farmer._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return error(res, 'Not authorized to generate story for this crop', 403);
    }

    // Generate story
    const storyResult = await aiService.generateCropStory(crop, language, storyType);

    logger.info(`AI story generated for crop ${cropId} in ${language}`);

    success(res, 'Crop story generated successfully', {
      story: storyResult
    });

  } catch (err) {
    logger.error('Generate story error:', err);
    error(res, 'Failed to generate crop story', 500);
  }
});

/**
 * @route   POST /api/ai/analyze-crop
 * @desc    Analyze crop data with AI insights
 * @access  Private
 */
router.post('/analyze-crop', [
  authenticate,
  body('cropId')
    .isMongoId()
    .withMessage('Valid crop ID is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { cropId } = req.body;

    // Get crop details
    const crop = await Crop.findById(cropId)
      .populate('farmer', 'name')
      .populate('location');

    if (!crop) {
      return error(res, 'Crop not found', 404);
    }

    // Check if user has permission to analyze this crop
    if (crop.farmer._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return error(res, 'Not authorized to analyze this crop', 403);
    }

    // Analyze crop
    const analysis = await aiService.analyzeCrop(crop);

    logger.info(`AI crop analysis completed for crop ${cropId}`);

    success(res, 'Crop analysis completed successfully', {
      analysis
    });

  } catch (err) {
    logger.error('Analyze crop error:', err);
    error(res, 'Failed to analyze crop', 500);
  }
});

/**
 * @route   GET /api/ai/crop-recommendations
 * @desc    Get AI-powered crop recommendations for location and season
 * @access  Private (Farmers)
 */
router.get('/crop-recommendations', [
  authenticate,
  authorize('farmer'),
  query('location')
    .notEmpty()
    .withMessage('Location is required'),
  query('season')
    .isIn(['kharif', 'rabi', 'zaid'])
    .withMessage('Season must be kharif, rabi, or zaid'),
  query('organic')
    .optional()
    .isBoolean()
    .withMessage('Organic must be true or false'),
  query('experience')
    .optional()
    .isIn(['beginner', 'intermediate', 'expert'])
    .withMessage('Experience must be beginner, intermediate, or expert')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { location, season, organic, experience } = req.query;

    const preferences = {
      organic: organic === 'true',
      experience: experience || 'intermediate'
    };

    // Get recommendations
    const recommendations = await aiService.getCropRecommendations(location, season, preferences);

    logger.info(`AI crop recommendations generated for ${location} in ${season} season`);

    success(res, 'Crop recommendations generated successfully', {
      recommendations
    });

  } catch (err) {
    logger.error('Get crop recommendations error:', err);
    error(res, 'Failed to get crop recommendations', 500);
  }
});

/**
 * @route   POST /api/ai/translate
 * @desc    Translate text to specified language
 * @access  Private
 */
router.post('/translate', [
  authenticate,
  body('text')
    .notEmpty()
    .withMessage('Text to translate is required'),
  body('targetLanguage')
    .isIn(['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or'])
    .withMessage('Unsupported target language')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { text, targetLanguage } = req.body;

    // Translate text
    const translation = await aiService.translateText(text, targetLanguage);

    logger.info(`Text translated to ${targetLanguage} by user ${req.user._id}`);

    success(res, 'Text translated successfully', {
      translation
    });

  } catch (err) {
    logger.error('Translate text error:', err);
    error(res, 'Failed to translate text', 500);
  }
});

/**
 * @route   GET /api/ai/supported-languages
 * @desc    Get list of supported languages
 * @access  Public
 */
router.get('/supported-languages', (req, res) => {
  try {
    const languages = Object.entries(aiService.supportedLanguages).map(([code, name]) => ({
      code,
      name,
      nativeName: getNativeLanguageName(code)
    }));

    success(res, 'Supported languages retrieved successfully', {
      languages,
      total: languages.length
    });

  } catch (err) {
    logger.error('Get supported languages error:', err);
    error(res, 'Failed to get supported languages', 500);
  }
});

/**
 * @route   GET /api/ai/health
 * @desc    Check AI service health
 * @access  Public
 */
router.get('/health', async (req, res) => {
  try {
    const health = await aiService.healthCheck();

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (err) {
    logger.error('AI health check error:', err);
    res.status(503).json({
      service: 'ai-service',
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date()
    });
  }
});

/**
 * @route   GET /api/ai/story-templates
 * @desc    Get available story templates and types
 * @access  Public
 */
router.get('/story-templates', (req, res) => {
  try {
    const templates = {
      types: [
        {
          id: 'comprehensive',
          name: 'Comprehensive Story',
          description: 'Detailed story covering farmer, cultivation, quality, and cultural aspects',
          wordCount: '300-400 words',
          useCase: 'Consumer engagement, detailed product pages'
        },
        {
          id: 'brief',
          name: 'Brief Story',
          description: 'Concise story highlighting key farmer and quality aspects',
          wordCount: '100-150 words',
          useCase: 'Product listings, quick previews'
        },
        {
          id: 'technical',
          name: 'Technical Story',
          description: 'Focus on cultivation methods, quality parameters, and specifications',
          wordCount: '200-250 words',
          useCase: 'B2B buyers, wholesale markets'
        }
      ],
      features: [
        'Multilingual support (11 languages)',
        'Culturally appropriate content',
        'SEO-optimized narratives',
        'Farmer attribution',
        'Quality certification highlights'
      ]
    };

    success(res, 'Story templates retrieved successfully', {
      templates
    });

  } catch (err) {
    logger.error('Get story templates error:', err);
    error(res, 'Failed to get story templates', 500);
  }
});

/**
 * @route   POST /api/ai/batch-stories
 * @desc    Generate stories for multiple crops (Admin/Bulk operation)
 * @access  Private (Admin)
 */
router.post('/batch-stories', [
  authenticate,
  authorize('admin'),
  body('cropIds')
    .isArray({ min: 1, max: 10 })
    .withMessage('Crop IDs array required (1-10 crops)'),
  body('cropIds.*')
    .isMongoId()
    .withMessage('Valid crop ID required'),
  body('language')
    .optional()
    .isIn(['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or'])
    .withMessage('Unsupported language'),
  body('storyType')
    .optional()
    .isIn(['comprehensive', 'brief', 'technical'])
    .withMessage('Invalid story type')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { cropIds, language = 'en', storyType = 'comprehensive' } = req.body;

    // Get crop details
    const crops = await Crop.find({ _id: { $in: cropIds } })
      .populate('farmer', 'name')
      .populate('location');

    if (crops.length !== cropIds.length) {
      return error(res, 'Some crops not found', 404);
    }

    // Generate stories for each crop
    const stories = [];
    for (const crop of crops) {
      try {
        const storyResult = await aiService.generateCropStory(crop, language, storyType);
        stories.push({
          cropId: crop._id,
          cropName: crop.name,
          story: storyResult
        });
      } catch (storyError) {
        logger.error(`Failed to generate story for crop ${crop._id}:`, storyError);
        stories.push({
          cropId: crop._id,
          cropName: crop.name,
          error: 'Story generation failed'
        });
      }
    }

    logger.info(`Batch story generation completed for ${stories.length} crops`);

    success(res, 'Batch story generation completed', {
      stories,
      totalRequested: cropIds.length,
      totalGenerated: stories.filter(s => !s.error).length,
      language,
      storyType
    });

  } catch (err) {
    logger.error('Batch stories error:', err);
    error(res, 'Failed to generate batch stories', 500);
  }
});

// Helper function to get native language names
function getNativeLanguageName(code) {
  const nativeNames = {
    'en': 'English',
    'hi': 'हिंदी',
    'bn': 'বাংলা',
    'ta': 'தமிழ்',
    'te': 'తెలుగు',
    'mr': 'मराठी',
    'gu': 'ગુજરાતી',
    'kn': 'ಕನ್ನಡ',
    'ml': 'മലയാളം',
    'pa': 'ਪੰਜਾਬੀ',
    'or': 'ଓଡ଼ିଆ'
  };

  return nativeNames[code] || nativeNames['en'];
}

module.exports = router;