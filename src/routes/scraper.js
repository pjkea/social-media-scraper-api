const express = require('express');
const rateLimit = require('express-rate-limit');
const { validateScrapeRequest } = require('../middleware/validation');
const ScrapingService = require('../services/scrapingService');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting for scraping endpoints
const scrapeLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX || 10,
    message: {
        success: false,
        error: 'Too many scraping requests, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * @swagger
 * tags:
 *   name: Scraper
 *   description: Social media scraping endpoints
 */

/**
 * @swagger
 * /api/scrape:
 *   post:
 *     summary: Scrape social media posts
 *     description: Scrape posts from a target user's social media profile within a specified timeframe
 *     tags: [Scraper]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - targetUser
 *               - platform
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email/username for platform login
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 description: Password for platform login (optional for some platforms)
 *                 example: "your_password"
 *               targetUser:
 *                 type: string
 *                 description: Username of the target profile to scrape
 *                 example: "elonmusk"
 *               platform:
 *                 type: string
 *                 enum: [twitter, facebook]
 *                 description: Social media platform to scrape
 *                 example: "twitter"
 *               timeframe:
 *                 type: string
 *                 enum: [1h, 6h, 12h, 1d, 3d, 7d, 30d]
 *                 default: "7d"
 *                 description: Time window for scraping posts
 *                 example: "7d"
 *               customUrl:
 *                 type: string
 *                 format: uri
 *                 description: Custom URL to scrape instead of auto-generated profile URL
 *                 example: "https://twitter.com/elonmusk"
 *     responses:
 *       200:
 *         description: Successfully scraped posts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ScrapeResponse'
 *       400:
 *         description: Bad request - missing or invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missing_fields:
 *                 summary: Missing required fields
 *                 value:
 *                   success: false
 *                   error: "Missing required fields: email, targetUser, and platform are required"
 *               unsupported_platform:
 *                 summary: Unsupported platform
 *                 value:
 *                   success: false
 *                   error: "Unsupported platform: facebook. Supported platforms: twitter, instagram, linkedin"
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Error'
 *                 - type: object
 *                   properties:
 *                     retryAfter:
 *                       type: string
 *                       example: "15 minutes"
 *       500:
 *         description: Internal server error during scraping
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               error: "Navigation timeout exceeded"
 *               details: "An error occurred during scraping"
 */
router.post('/scrape', scrapeLimit, validateScrapeRequest, async (req, res, next) => {
    const { email, password, targetUser, platform, timeframe = '7d', customUrl } = req.body;

    try {
        logger.info(`Starting scrape request for ${targetUser} on ${platform}`, {
            targetUser,
            platform,
            timeframe,
            ip: req.ip
        });

        const result = await ScrapingService.scrapeProfile({
            email,
            password,
            targetUser,
            platform: platform.toLowerCase(),
            timeframe,
            customUrl
        });

        logger.info(`Scrape completed for ${targetUser}`, {
            platform,
            postsCount: result.data.totalPosts
        });

        res.json(result);
    } catch (error) {
        logger.error('Scraping failed', {
            error: error.message,
            targetUser,
            platform,
            stack: error.stack
        });
        next(error);
    }
});

/**
 * @swagger
 * /api/platforms:
 *   get:
 *     summary: Get supported platforms and configuration
 *     description: Retrieve information about supported platforms, timeframes, and date formats
 *     tags: [Scraper]
 *     responses:
 *       200:
 *         description: Successfully retrieved platform information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 platforms:
 *                   type: array
 *                   items:
 *                     type: string
 *                     enum: [twitter, instagram, linkedin]
 *                   example: ["twitter", "facebook"]
 *                 timeframes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["1h", "6h", "12h", "1d", "3d", "7d", "30d"]
 *                 dateRangeFormats:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       example:
 *                         oneOf:
 *                           - type: string
 *                           - type: object
 *                       description:
 *                         type: string
 *                   example:
 *                     - type: "object"
 *                       example: { startDate: "2024-01-01", endDate: "2024-03-15" }
 *                       description: "Object with startDate and endDate"
 *                     - type: "string_range"
 *                       example: "2024-01-01 to 2024-03-15"
 *                       description: "Date range string with 'to' separator"
 *                 examples:
 *                   type: object
 *                   properties:
 *                     specificMonth:
 *                       type: string
 *                       example: "2024-01"
 *                     specificYear:
 *                       type: string
 *                       example: "2024"
 *                     dateRange:
 *                       type: string
 *                       example: "2024-01-15 to 2024-02-28"
 *                     objectFormat:
 *                       type: object
 *                       example: { startDate: "2024-01-01", endDate: "2024-03-31" }
 */
router.get('/platforms', (req, res) => {
    const platformInfo = {
        platforms: ['twitter', 'facebook'],
        dateRangeFormats: [
            {
                type: "object",
                example: { startDate: "2024-01-01", endDate: "2024-03-15" },
                description: "Object with startDate and endDate"
            },
            {
                type: "string_range",
                example: "2024-01-01 to 2024-03-15",
                description: "Date range string with 'to' separator"
            },
            {
                type: "string_range_dash",
                example: "Jan 2024 - Mar 2024",
                description: "Date range string with dash separator"
            },
            {
                type: "single_date",
                example: "2024-01",
                description: "Single date (will scrape entire month)"
            },
            {
                type: "year_only",
                example: "2024",
                description: "Year only (will scrape entire year)"
            }
        ],
        timeframes: ['1h', '6h', '12h', '1d', '3d', '7d', '30d'],
        examples: {
            specificMonth: "2024-01",
            specificYear: "2024",
            dateRange: "2024-01-15 to 2024-02-28",
            objectFormat: { startDate: "2024-01-01", endDate: "2024-03-31" }
        }
    };

    res.json(platformInfo);
});

/**
 * @swagger
 * /api/scrape/validate:
 *   post:
 *     summary: Validate scraping parameters
 *     description: Validate scraping request parameters without actually performing the scrape
 *     tags: [Scraper]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - targetUser
 *               - platform
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               targetUser:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [twitter, instagram, linkedin]
 *               timeframe:
 *                 type: string
 *                 enum: [1h, 6h, 12h, 1d, 3d, 7d, 30d]
 *               customUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Parameters are valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Parameters are valid"
 *                 validatedParameters:
 *                   type: object
 *       400:
 *         description: Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/scrape/validate', validateScrapeRequest, (req, res) => {
    res.json({
        success: true,
        message: 'Parameters are valid',
        validatedParameters: {
            email: req.body.email,
            targetUser: req.body.targetUser,
            platform: req.body.platform.toLowerCase(),
            timeframe: req.body.timeframe || '7d',
            customUrl: req.body.customUrl || null
        }
    });
});

module.exports = router;