/**
 * Standardized response utility for API endpoints
 */

/**
 * Success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} status - HTTP status code (default: 200)
 */
const success = (res, data = null, message = 'Success', status = 200) => {
  const response = {
    success: true,
    message,
    ...(data !== null && { data })
  };
  
  return res.status(status).json(response);
};

/**
 * Error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} status - HTTP status code (default: 400)
 * @param {Object} errors - Additional error details
 */
const error = (res, message = 'An error occurred', status = 400, errors = {}) => {
  const response = {
    success: false,
    message,
    ...(Object.keys(errors).length > 0 && { errors })
  };
  
  return res.status(status).json(response);
};

/**
 * Not found response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
const notFound = (res, message = 'Resource not found') => {
  return error(res, message, 404);
};

/**
 * Unauthorized response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
const unauthorized = (res, message = 'Unauthorized') => {
  return error(res, message, 401);
};

/**
 * Forbidden response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
const forbidden = (res, message = 'Forbidden') => {
  return error(res, message, 403);
};

/**
 * Validation error response
 * @param {Object} res - Express response object
 * @param {Object} errors - Validation errors
 * @param {string} message - Error message
 */
const validationError = (res, errors, message = 'Validation failed') => {
  return error(res, message, 422, { errors });
};

/**
 * Server error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {Error} error - Error object for logging
 */
const serverError = (res, message = 'Internal server error', error = null) => {
  if (error) {
    console.error('Server Error:', error);
  }
  
  return res.status(500).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && error && { 
      error: error.message,
      stack: error.stack 
    })
  });
};

module.exports = {
  success,
  error,
  notFound,
  unauthorized,
  forbidden,
  validationError,
  serverError
};
