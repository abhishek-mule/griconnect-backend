const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');

const userSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ],
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    match: [/^[0-9]{10,15}$/, 'Please add a valid phone number'],
    trim: true
  },
  
  // Authentication
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['farmer', 'buyer', 'admin'],
    default: 'buyer'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  
  // Blockchain
  walletAddress: {
    type: String,
    match: [/^0x[a-fA-F0-9]{40}$/, 'Please add a valid Ethereum address'],
    lowercase: true,
    trim: true
  },
  walletNonce: {
    type: Number,
    default: 0
  },
  
  // Profile
  profileImage: String,
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot be more than 500 characters']
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    coordinates: {
      // GeoJSON Point
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: {
        type: [Number],
        index: '2dsphere'
      },
      formattedAddress: String,
      street: String,
      city: String,
      state: String,
      zipcode: String,
      country: String
    }
  },
  
  // Farmer-specific fields
  farmName: String,
  farmSize: {
    value: Number,
    unit: {
      type: String,
      enum: ['acre', 'hectare'],
      default: 'acre'
    }
  },
  crops: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Crop'
  }],
  
  // Buyer-specific fields
  companyName: String,
  taxId: String,
  
  // Security
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  emailVerificationToken: String,
  emailVerificationExpire: Date,
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  
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

// Encrypt password using bcrypt
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Sign JWT and return
userSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { 
      userId: this._id,
      role: this.role 
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRE || '30d' 
    }
  );
};

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password token
userSchema.methods.getResetPasswordToken = function() {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString('hex');
  
  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  // Set expire (10 minutes)
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  
  return resetToken;
};

// Generate email verification token
userSchema.methods.getEmailVerificationToken = function() {
  // Generate token
  const verificationToken = crypto.randomBytes(20).toString('hex');
  
  // Hash token and set to emailVerificationToken field
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
    
  // Set expire (24 hours)
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000;
  
  return verificationToken;
};

// Check if account is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Increment login attempts if login fails
userSchema.methods.incrementLoginAttempts = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return await this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      lockUntil: Date.now() + 30 * 60 * 1000 // Lock for 30 minutes
    };
  }
  
  return await this.updateOne(updates);
};

// Reset login attempts on successful login
userSchema.methods.resetLoginAttempts = async function() {
  if (this.loginAttempts > 0 || this.lockUntil) {
    return await this.updateOne({
      $set: { loginAttempts: 0 },
      $unset: { lockUntil: 1 }
    });
  }
};

// Cascade delete crops when a user is deleted
userSchema.pre('remove', async function(next) {
  if (this.role === 'farmer') {
    await this.model('Crop').deleteMany({ farmer: this._id });
  }
  next();
});

// Create index for better query performance
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ walletAddress: 1 }, { unique: true, sparse: true });
userSchema.index({ 'address.coordinates': '2dsphere' });

module.exports = mongoose.model('User', userSchema);
