const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const { success, error, unauthorized } = require('../utils/response');

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('role')
    .optional()
    .isIn(['farmer', 'buyer', 'admin'])
    .withMessage('Role must be farmer, buyer, or admin')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { name, email, password, role = 'buyer', phone, walletAddress } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return error(res, 'User with this email already exists', 400);
    }

    // Check wallet address uniqueness if provided
    if (walletAddress) {
      const existingWallet = await User.findOne({ walletAddress });
      if (existingWallet) {
        return error(res, 'Wallet address is already registered', 400);
      }
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role,
      phone,
      walletAddress
    });

    // Generate JWT token
    const token = user.getSignedJwtToken();

    // Remove password from response
    user.password = undefined;

    logger.info(`New user registered: ${user.email} (${user.role})`);

    success(res, 'User registered successfully', {
      user,
      token
    }, 201);

  } catch (err) {
    logger.error('Registration error:', err);
    error(res, 'Registration failed', 500);
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { email, password } = req.body;

    // Check if user exists and get password
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return unauthorized(res, 'Invalid credentials');
    }

    // Check if account is locked
    if (user.isLocked) {
      return error(res, 'Account is temporarily locked due to too many failed login attempts', 423);
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      // Increment login attempts
      await user.incrementLoginAttempts();

      // Check if account should be locked
      const updatedUser = await User.findById(user._id);
      if (updatedUser.isLocked) {
        return error(res, 'Account locked due to too many failed attempts. Try again later.', 423);
      }

      return unauthorized(res, 'Invalid credentials');
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = user.getSignedJwtToken();

    // Remove password from response
    user.password = undefined;

    logger.info(`User logged in: ${user.email}`);

    success(res, 'Login successful', {
      user,
      token
    });

  } catch (err) {
    logger.error('Login error:', err);
    error(res, 'Login failed', 500);
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('crops')
      .select('-password');

    if (!user) {
      return error(res, 'User not found', 404);
    }

    success(res, 'User profile retrieved', { user });

  } catch (err) {
    logger.error('Get profile error:', err);
    error(res, 'Failed to get user profile', 500);
  }
});

/**
 * @route   PUT /api/auth/update-profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/update-profile', [
  authenticate,
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .matches(/^[0-9]{10,15}$/)
    .withMessage('Please provide a valid phone number'),
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const allowedFields = [
      'name', 'phone', 'bio', 'profileImage',
      'farmName', 'farmSize', 'companyName', 'taxId'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Handle address updates
    if (req.body.address) {
      updates.address = req.body.address;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return error(res, 'User not found', 404);
    }

    logger.info(`User profile updated: ${user.email}`);

    success(res, 'Profile updated successfully', { user });

  } catch (err) {
    logger.error('Update profile error:', err);
    error(res, 'Failed to update profile', 500);
  }
});

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password', [
  authenticate,
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return error(res, 'User not found', 404);
    }

    // Check current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return error(res, 'Current password is incorrect', 400);
    }

    // Update password
    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);

    success(res, 'Password changed successfully');

  } catch (err) {
    logger.error('Change password error:', err);
    error(res, 'Failed to change password', 500);
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if email exists or not for security
      return success(res, 'If an account with that email exists, a password reset link has been sent.');
    }

    // Generate reset token
    const resetToken = user.getResetPasswordToken();
    await user.save();

    // TODO: Send email with reset token
    // For now, just log it (in production, send email)
    logger.info(`Password reset requested for ${email}. Token: ${resetToken}`);

    success(res, 'If an account with that email exists, a password reset link has been sent.');

  } catch (err) {
    logger.error('Forgot password error:', err);
    error(res, 'Failed to process password reset request', 500);
  }
});

/**
 * @route   POST /api/auth/reset-password/:token
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password/:token', [
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return error(res, 'Validation failed', 400, errors.array());
    }

    const { token } = req.params;
    const { password } = req.body;

    // Hash the token
    const resetPasswordToken = require('crypto')
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return error(res, 'Invalid or expired reset token', 400);
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    logger.info(`Password reset successful for user: ${user.email}`);

    success(res, 'Password reset successful');

  } catch (err) {
    logger.error('Reset password error:', err);
    error(res, 'Failed to reset password', 500);
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post('/logout', authenticate, (req, res) => {
  logger.info(`User logged out: ${req.user.email}`);
  success(res, 'Logged out successfully');
});

module.exports = router;