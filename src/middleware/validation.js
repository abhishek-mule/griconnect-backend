const Joi = require('joi');
const { validationError } = require('../utils/response');

/**
 * Validation middleware for request bodies
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} source - Request property to validate ('body', 'query', or 'params')
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });
    
    if (error) {
      const errors = {};
      
      error.details.forEach(err => {
        const key = err.path.join('.');
        errors[key] = errors[key] || [];
        errors[key].push(err.message);
      });
      
      return validationError(res, errors, 'Validation failed');
    }
    
    // Replace the request data with the validated and sanitized data
    req[source] = value;
    next();
  };
};

// Common validation schemas
const schemas = {
  // Authentication
  register: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    role: Joi.string().valid('farmer', 'buyer', 'admin').default('buyer'),
    phone: Joi.string().pattern(/^[0-9]{10,15}$/),
    address: Joi.object({
      street: Joi.string(),
      city: Joi.string(),
      state: Joi.string(),
      country: Joi.string(),
      postalCode: Joi.string(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      })
    })
  }),
  
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),
  
  // Crop
  createCrop: Joi.object({
    cropType: Joi.string().required(),
    variety: Joi.string().required(),
    quantity: Joi.object({
      value: Joi.number().min(0.1).required(),
      unit: Joi.string().valid('kg', 'ton', 'quintal').default('kg')
    }).required(),
    location: Joi.object({
      farmName: Joi.string().required(),
      address: Joi.string().required(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).required(),
      area: Joi.object({
        value: Joi.number().min(0.01).required(),
        unit: Joi.string().valid('acre', 'hectare').default('acre')
      })
    }).required(),
    timeline: Joi.object({
      sowingDate: Joi.date().required(),
      expectedHarvestDate: Joi.date().min(Joi.ref('sowingDate')).required()
    }).required(),
    practices: Joi.object({
      seedSource: Joi.string(),
      fertilizers: Joi.array().items(Joi.object({
        name: Joi.string().required(),
        type: Joi.string().valid('organic', 'chemical', 'bio-fertilizer').required(),
        quantity: Joi.string().required(),
        applicationDate: Joi.date()
      })),
      pesticides: Joi.array().items(Joi.object({
        name: Joi.string().required(),
        type: Joi.string().valid('organic', 'chemical', 'biological').required(),
        reason: Joi.string().required(),
        applicationDate: Joi.date()
      })),
      irrigation: Joi.object({
        method: Joi.string().valid('drip', 'sprinkler', 'flood', 'rainfed').required(),
        waterSource: Joi.string().valid('borewell', 'canal', 'river', 'rainwater').required()
      }),
      soilType: Joi.string(),
      weatherConditions: Joi.string()
    }),
    quality: Joi.object({
      grade: Joi.string().valid('A+', 'A', 'B+', 'B', 'C'),
      moistureContent: Joi.number().min(0).max(100),
      purityPercentage: Joi.number().min(0).max(100),
      defectPercentage: Joi.number().min(0).max(100)
    }),
    pricing: Joi.object({
      basePrice: Joi.number().min(0).required(),
      currency: Joi.string().default('INR'),
      premiumPercentage: Joi.number().min(0).default(0)
    }).required()
  }),
  
  // Payment
  createPayment: Joi.object({
    amount: Joi.number().min(0.01).required(),
    currency: Joi.string().valid('INR', 'MATIC', 'POL').default('INR'),
    method: Joi.string().valid('upi', 'crypto').required(),
    cropId: Joi.string().required(),
    farmerId: Joi.string().required(),
    metadata: Joi.object()
  }),
  
  // NFT
  createNFT: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().required(),
    image: Joi.string().uri().required(),
    attributes: Joi.array().items(Joi.object({
      trait_type: Joi.string().required(),
      value: Joi.any().required()
    })),
    cropId: Joi.string().required()
  })
};

module.exports = {
  validate,
  schemas
};
