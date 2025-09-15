const logger = require('../utils/logger');

/**
 * Custom error classes
 */
class ScrapingError extends Error {
    constructor(message, statusCode = 500, platform = null) {
        super(message);
        this.name = 'ScrapingError';
        this.statusCode = statusCode;
        this.platform = platform;
    }
}

class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
        this.field = field;
    }
}

class RateLimitError extends Error {
    constructor(message = 'Rate limit exceeded') {
        super(message);
        this.name = 'RateLimitError';
        this.statusCode = 429;
    }
}

/**
 * Main error handling middleware
 */
const errorHandler = (error, req, res, next) => {
    // Log error details
    logger.error('Error occurred:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Default error response
    let statusCode = error.statusCode || 500;
    let message = error.message || 'Internal server error';
    let details = null;

    // Handle specific error types
    switch (error.name) {
        case 'ScrapingError':
            details = `Scraping failed for platform: ${error.platform}`;
            break;

        case 'ValidationError':
            statusCode = 400;
            details = error.field ? `Validation failed for field: ${error.field}` : 'Request validation failed';
            break;

        case 'RateLimitError':
            statusCode = 429;
            details = 'Too many requests. Please try again later.';
            break;

        case 'TimeoutError':
            statusCode = 408;
            message = 'Request timeout';
            details = 'The operation took too long to complete';
            break;

        case 'CastError':
        case 'ValidationError':
            statusCode = 400;
            message = 'Invalid request data';
            details = 'Please check your request parameters';
            break;

        case 'UnauthorizedError':
        case 'JsonWebTokenError':
            statusCode = 401;
            message = 'Unauthorized';
            details = 'Invalid or missing authentication';
            break;

        case 'ForbiddenError':
            statusCode = 403;
            message = 'Forbidden';
            details = 'You do not have permission to access this resource';
            break;

        case 'NotFoundError':
            statusCode = 404;
            message = 'Resource not found';
            details = 'The requested resource could not be found';
            break;

        default:
            // Handle Puppeteer-specific errors
            if (error.message.includes('Navigation timeout')) {
                statusCode = 408;
                message = 'Navigation timeout';
                details = 'The page took too long to load';
            } else if (error.message.includes('net::ERR_')) {
                statusCode = 502;
                message = 'Network error';
                details = 'Unable to connect to the target website';
            } else if (error.message.includes('Target closed')) {
                statusCode = 500;
                message = 'Browser session ended unexpectedly';
                details = 'The scraping session was interrupted';
            }
            break;
    }

    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
        message = 'Internal server error';
        details = 'An unexpected error occurred';
    }

    // Send error response
    res.status(statusCode).json({
        success: false,
        error: message,
        details: details,
        ...(process.env.NODE_ENV === 'development' && {
            stack: error.stack,
            timestamp: new Date().toISOString()
        })
    });
};

/**
 * Handle async errors in routes
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * 404 handler for unknown routes
 */
const notFoundHandler = (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        details: `Cannot ${req.method} ${req.path}`,
        availableEndpoints: {
            documentation: '/api/docs',
            health: '/api/health',
            scrape: '/api/scrape',
            platforms: '/api/platforms'
        }
    });
};

module.exports = {
    errorHandler,
    asyncHandler,
    notFoundHandler,
    ScrapingError,
    ValidationError,
    RateLimitError
};