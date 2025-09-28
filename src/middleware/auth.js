const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const { unauthorized, forbidden } = require('../utils/response');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request object
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'Authentication token is required');
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return unauthorized(res, 'Authentication token is required');
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return unauthorized(res, 'User not found');
    }
    
    // Check if user is active
    if (!user.isActive) {
      return forbidden(res, 'User account is deactivated');
    }
    
    // Attach user to request object
    req.user = user;
    
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return unauthorized(res, 'Invalid token');
    }
    
    if (error.name === 'TokenExpiredError') {
      return unauthorized(res, 'Token has expired');
    }
    
    return unauthorized(res, 'Not authorized to access this route');
  }
};

/**
 * Role-based authorization middleware
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return unauthorized(res, 'User not authenticated');
    }
    
    if (!roles.includes(req.user.role)) {
      return forbidden(res, `User role ${req.user.role} is not authorized to access this route`);
    }
    
    next();
  };
};

/**
 * Ownership check middleware
 * Verifies that the user owns the resource or is an admin
 * @param {string} modelName - Name of the model to check ownership against
 * @param {string} idParam - Name of the route parameter containing the resource ID
 */
const checkOwnership = (modelName, idParam = 'id') => {
  return async (req, res, next) => {
    try {
      const Model = require(`../models/${modelName}`);
      const resource = await Model.findById(req.params[idParam]);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }
      
      // Allow admins to access any resource
      if (req.user.role === 'admin') {
        return next();
      }
      
      // Check if user owns the resource
      if (resource.user && resource.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this resource'
        });
      }
      
      // Check if user is the owner (for models with 'owner' field)
      if (resource.owner && resource.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this resource'
        });
      }
      
      // Check if user is the farmer (for crop-related resources)
      if (resource.farmerId && resource.farmerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this resource'
        });
      }
      
      next();
    } catch (error) {
      logger.error('Ownership check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking resource ownership'
      });
    }
  };
};

module.exports = {
  authenticate,
  authorize,
  checkOwnership
};
