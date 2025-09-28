const mongoose = require('mongoose');
const logger = require('../utils/logger');

const cropSchema = new mongoose.Schema({
  // Basic Information
  cropId: {
    type: String,
    unique: true,
    required: true,
    default: () => `CROP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  name: {
    type: String,
    required: [true, 'Please add a crop name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  description: {
    type: String,
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  
  // Classification
  cropType: {
    type: String,
    required: [true, 'Please specify the crop type'],
    enum: [
      'cereals', 'pulses', 'oilseeds', 'vegetables', 'fruits', 
      'spices', 'plantation', 'flowers', 'medicinal', 'fodder', 'other'
    ]
  },
  variety: {
    type: String,
    required: [true, 'Please specify the crop variety']
  },
  
  // Quantity and Quality
  quantity: {
    value: {
      type: Number,
      required: [true, 'Please add quantity'],
      min: [0.1, 'Quantity must be at least 0.1']
    },
    unit: {
      type: String,
      enum: ['kg', 'ton', 'quintal', 'unit'],
      default: 'kg'
    },
    available: {
      type: Number,
      default: function() { 
        return this.quantity ? this.quantity.value : 0; 
      }
    }
  },
  
  quality: {
    grade: {
      type: String,
      enum: ['A+', 'A', 'B+', 'B', 'C', null],
      default: null
    },
    moistureContent: {
      type: Number,
      min: 0,
      max: 100
    },
    purityPercentage: {
      type: Number,
      min: 0,
      max: 100
    },
    testReports: [{
      name: String,
      value: String,
      conductedBy: String,
      conductedAt: Date,
      certificateUrl: String
    }]
  },
  
  // Location and Farm Details
  location: {
    farmName: {
      type: String,
      required: [true, 'Please add a farm name']
    },
    address: {
      type: String,
      required: [true, 'Please add an address']
    },
    coordinates: {
      // GeoJSON Point
      type: {
        type: String,
        enum: ['Point'],
        required: true
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: function(v) {
            return v.length === 2 && 
                   v[0] >= -180 && v[0] <= 180 && 
                   v[1] >= -90 && v[1] <= 90;
          },
          message: props => `${props.value} is not a valid coordinate`
        }
      },
      formattedAddress: String,
      street: String,
      city: String,
      state: String,
      zipcode: String,
      country: String
    },
    area: {
      value: {
        type: Number,
        required: [true, 'Please add area'],
        min: [0.01, 'Area must be at least 0.01']
      },
      unit: {
        type: String,
        enum: ['acre', 'hectare'],
        default: 'acre'
      }
    },
    soilType: String,
    irrigationSource: {
      type: String,
      enum: ['rainfed', 'irrigated', 'both', null],
      default: null
    }
  },
  
  // Cultivation Details
  cultivation: {
    sowingDate: {
      type: Date,
      required: [true, 'Please add sowing date']
    },
    harvestDate: {
      type: Date,
      required: [true, 'Please add expected harvest date'],
      validate: {
        validator: function(v) {
          return v > this.cultivation.sowingDate;
        },
        message: 'Harvest date must be after sowing date'
      }
    },
    actualHarvestDate: Date,
    organic: {
      type: Boolean,
      default: false
    },
    certification: {
      type: String,
      enum: ['organic', 'fairtrade', 'rainforest-alliance', 'utz', 'none', null],
      default: null
    },
    certificationId: String,
    certificationBody: String,
    certificationValidUntil: Date
  },
  
  // Inputs
  inputs: {
    seeds: [{
      name: String,
      type: String,
      quantity: Number,
      unit: String,
      source: String,
      isOrganic: Boolean
    }],
    fertilizers: [{
      name: String,
      type: {
        type: String,
        enum: ['organic', 'chemical', 'bio-fertilizer']
      },
      quantity: Number,
      unit: String,
      applicationDate: Date,
      method: String
    }],
    pesticides: [{
      name: String,
      type: {
        type: String,
        enum: ['organic', 'chemical', 'biological']
      },
      quantity: Number,
      unit: String,
      applicationDate: Date,
      targetPest: String,
      preHarvestInterval: Number // in days
    }],
    irrigation: [{
      date: Date,
      method: {
        type: String,
        enum: ['drip', 'sprinkler', 'flood', 'rainfed']
      },
      waterSource: {
        type: String,
        enum: ['borewell', 'canal', 'river', 'rainwater']
      },
      amount: Number,
      unit: {
        type: String,
        enum: ['mm', 'inch', 'litre', 'gallon']
      }
    }],
    labor: [{
      activity: String,
      date: Date,
      numberOfWorkers: Number,
      hoursWorked: Number,
      notes: String
    }]
  },
  
  // Blockchain and Digital Assets
  nft: {
    tokenId: String,
    contractAddress: String,
    tokenURI: String,
    metadata: {
      name: String,
      description: String,
      image: String,
      external_url: String,
      attributes: [
        {
          trait_type: String,
          value: String || Number,
          display_type: String
        }
      ]
    },
    isMinted: {
      type: Boolean,
      default: false
    },
    mintedAt: Date,
    transactionHash: String
  },
  
  // Media
  images: [{
    url: String,
    description: String,
    isPrimary: {
      type: Boolean,
      default: false
    },
    ipfsHash: String
  }],
  documents: [{
    name: String,
    type: {
      type: String,
      enum: ['certificate', 'test-report', 'invoice', 'other']
    },
    url: String,
    ipfsHash: String,
    issuedBy: String,
    issuedAt: Date,
    validUntil: Date
  }],
  
  // Pricing and Sales
  pricing: {
    basePrice: {
      type: Number,
      required: [true, 'Please add a base price'],
      min: [0, 'Price cannot be negative']
    },
    currency: {
      type: String,
      enum: ['INR', 'USD', 'EUR', 'MATIC', 'ETH'],
      default: 'INR'
    },
    isNegotiable: {
      type: Boolean,
      default: false
    },
    minOrderQuantity: {
      type: Number,
      default: 1
    },
    maxOrderQuantity: Number,
    bulkDiscount: [{
      minQuantity: Number,
      discountPercentage: Number
    }],
    paymentMethods: [{
      type: String,
      enum: ['cash', 'bank-transfer', 'upi', 'crypto', 'card']
    }]
  },
  
  // Status and Lifecycle
  status: {
    type: String,
    enum: [
      'planning', 'planted', 'growing', 'ready-for-harvest', 
      'harvested', 'in-storage', 'listed', 'reserved', 'sold', 'shipped', 'delivered', 'cancelled'
    ],
    default: 'planning'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Relationships
  farmer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Please add a farmer']
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Timestamps
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

// Add text index for search
cropSchema.index({
  name: 'text',
  description: 'text',
  'location.farmName': 'text',
  variety: 'text'
});

// Add 2dsphere index for geospatial queries
cropSchema.index({ 'location.coordinates': '2dsphere' });

// Virtual for crop age in days
cropSchema.virtual('ageInDays').get(function() {
  if (!this.cultivation?.sowingDate) return null;
  const diffTime = Math.abs(new Date() - this.cultivation.sowingDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for days to harvest
cropSchema.virtual('daysToHarvest').get(function() {
  if (!this.cultivation?.harvestDate) return null;
  const diffTime = Math.abs(this.cultivation.harvestDate - new Date());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for crop lifecycle stage
cropSchema.virtual('lifecycleStage').get(function() {
  if (!this.cultivation?.sowingDate || !this.cultivation?.harvestDate) return 'planning';
  
  const now = new Date();
  const sowingDate = new Date(this.cultivation.sowingDate);
  const harvestDate = new Date(this.cultivation.harvestDate);
  
  if (now < sowingDate) return 'planned';
  if (now >= sowingDate && now < harvestDate) return 'growing';
  if (now >= harvestDate && (!this.cultivation.actualHarvestDate || now < this.cultivation.actualHarvestDate)) return 'ready-for-harvest';
  if (this.cultivation.actualHarvestDate && now >= this.cultivation.actualHarvestDate) return 'harvested';
  
  return 'unknown';
});

// Pre-save hook to update status based on dates
cropSchema.pre('save', function(next) {
  if (this.isModified('cultivation.sowingDate') || this.isModified('cultivation.harvestDate') || this.isNew) {
    this.status = this.lifecycleStage;
  }
  next();
});

// Static method to get crops by location within a radius
cropSchema.statics.getCropsNear = function(coordinates, maxDistance = 10000) {
  return this.find({
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance // in meters
      }
    },
    status: { $in: ['listed', 'in-storage'] },
    isActive: true
  });
};

// Method to check if crop is available for sale
cropSchema.methods.isAvailable = function(quantity = 1) {
  return (
    this.isActive &&
    this.status === 'listed' &&
    this.quantity.available >= quantity &&
    (!this.pricing.minOrderQuantity || quantity >= this.pricing.minOrderQuantity) &&
    (!this.pricing.maxOrderQuantity || quantity <= this.pricing.maxOrderQuantity)
  );
};

// Method to calculate price with bulk discount
cropSchema.methods.calculatePrice = function(quantity = 1) {
  if (!this.isAvailable(quantity)) {
    throw new Error('Crop is not available for the requested quantity');
  }
  
  let price = this.pricing.basePrice * quantity;
  
  // Apply bulk discount if applicable
  if (this.pricing.bulkDiscount && this.pricing.bulkDiscount.length > 0) {
    // Sort discounts by minQuantity in descending order
    const sortedDiscounts = [...this.pricing.bulkDiscount].sort((a, b) => b.minQuantity - a.minQuantity);
    
    // Find the best applicable discount
    const bestDiscount = sortedDiscounts.find(discount => quantity >= discount.minQuantity);
    
    if (bestDiscount) {
      const discountAmount = (price * bestDiscount.discountPercentage) / 100;
      price -= discountAmount;
    }
  }
  
  return {
    unitPrice: this.pricing.basePrice,
    quantity,
    subtotal: this.pricing.basePrice * quantity,
    discount: (this.pricing.basePrice * quantity) - price,
    total: price,
    currency: this.pricing.currency
  };
};

module.exports = mongoose.model('Crop', cropSchema);
