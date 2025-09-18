const Joi = require('joi');
const { isValidUrl } = require('../utils/scraperUtils');

// Validation schemas
const scrapeRequestSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),

    password: Joi.string()
        .min(1)
        .optional()
        .messages({
            'string.min': 'Password cannot be empty if provided'
        }),

    targetUser: Joi.string()
        .min(1)
        .max(100)
        .pattern(/^[a-zA-Z0-9_.-]+$/)
        .required()
        .messages({
            'string.min': 'Target username cannot be empty',
            'string.max': 'Target username cannot exceed 100 characters',
            'string.pattern.base': 'Target username can only contain letters, numbers, dots, hyphens, and underscores',
            'any.required': 'Target username is required'
        }),

    platform: Joi.string()
        .valid('twitter', 'facebook')
        .insensitive()
        .required()
        .messages({
            'any.only': 'Platform must be one of: twitter, facebook',
            'any.required': 'Platform is required'
        }),

    timeframe: Joi.string()
        .valid('1h', '6h', '12h', '1d', '3d', '7d', '30d')
        .default('7d')
        .messages({
            'any.only': 'Timeframe must be one of: 1h, 6h, 12h, 1d, 3d, 7d, 30d'
        }),

    customUrl: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .optional()
        .messages({
            'string.uri': 'Custom URL must be a valid HTTP or HTTPS URL'
        })
});

/**
 * Middleware to validate scrape requests
 */
const validateScrapeRequest = (req, res, next) => {
    const { error, value } = scrapeRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        const errorMessages = error.details.map(detail => detail.message);
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errorMessages,
            validationErrors: error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }))
        });
    }

    // Additional custom validations
    try {
        // Validate custom URL if provided
        if (value.customUrl && !isValidUrl(value.customUrl)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid custom URL format',
                details: 'Custom URL must be a valid HTTP or HTTPS URL'
            });
        }

        // Validate platform-specific requirements
        const platformRequirements = {
            twitter: { requiresPassword: false },
            facebook: { requiresPassword: true }
        };

        const requirement = platformRequirements[value.platform.toLowerCase()];
        if (requirement && requirement.requiresPassword && !value.password) {
            return res.status(400).json({
                success: false,
                error: 'Password required',
                details: `Password is required for ${value.platform} scraping`
            });
        }

        // Normalize platform name
        value.platform = value.platform.toLowerCase();

        // Set validated data on request
        req.body = value;
        next();

    } catch (validationError) {
        return res.status(400).json({
            success: false,
            error: 'Validation error',
            details: validationError.message
        });
    }
};

/**
 * Generic validation middleware factory
 */
const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errorMessages = error.details.map(detail => detail.message);
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errorMessages,
                validationErrors: error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    value: detail.context?.value
                }))
            });
        }

        req.body = value;
        next();
    };
};

/**
 * Validate query parameters
 */
const validateQuery = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errorMessages = error.details.map(detail => detail.message);
            return res.status(400).json({
                success: false,
                error: 'Query validation failed',
                details: errorMessages
            });
        }

        req.query = value;
        next();
    };
};

module.exports = {
    validateScrapeRequest,
    validateRequest,
    validateQuery,
    scrapeRequestSchema
};